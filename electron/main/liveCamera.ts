import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { app, ipcMain, safeStorage, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { CAMERA_IPC, type LiveCameraSettings, type LiveCameraSettingsInput, type LiveCameraStatus } from '../../src/types/liveCamera';
import { isAppUrl } from './security';
import { getMainWindow } from './windowManager';
import { CameraSettingsError, classifyCameraFailure, makeRtspUrl, validateCameraSettings } from './liveCameraValidation';
import { MjpegParser } from './mjpegParser';
import { APP_CONFIG } from '../../src/config/app.config';

interface StoredCamera {
  version: 1;
  settings: Omit<LiveCameraSettings, 'hasPassword'>;
  encryptedPassword: string;
}

const CONNECTION_TIMEOUT_MS = 15_000;
const FRAME_TIMEOUT_MS = 10_000;
const MAX_RETRY_MS = 30_000;

/** LAN networking and secrets belong only to the Electron main process. */
class LiveCameraService {
  private readonly settingsPath = path.join(app.getPath('userData'), 'live-camera.json');
  private stored: StoredCamera | null = null;
  private loaded: Promise<void> | null = null;
  private status: LiveCameraStatus = { state: 'idle' };
  private child: ChildProcess | null = null;
  private desired = false;
  private generation = 0;
  private retries = 0;
  private lastFrame = 0;
  private pendingAckAt: number | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  private secureStorageAvailable(): boolean {
    return safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  }

  private load(): Promise<void> {
    this.loaded ??= this.readSettings();
    return this.loaded;
  }

  private async readSettings(): Promise<void> {
    let raw: string;
    try {
      const stat = await fs.stat(this.settingsPath);
      if (stat.size > 128 * 1024) throw new Error('oversize');
      raw = await fs.readFile(this.settingsPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.setStatus({ state: 'error', message: 'Saxlanmış kamera ayarları oxuna bilmədi. Parametrləri yenidən saxlayın.' });
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredCamera>;
      if (parsed.version !== 1 || typeof parsed.encryptedPassword !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(parsed.encryptedPassword) || parsed.encryptedPassword.length > 8192) throw new Error('invalid');
      const validated = validateCameraSettings(parsed.settings);
      // Never accept/return a plaintext password planted in a settings file.
      if (validated.password !== undefined) throw new Error('plaintext');
      const { password: _password, ...settings } = validated;
      this.stored = { version: 1, settings, encryptedPassword: parsed.encryptedPassword };
    } catch {
      this.setStatus({ state: 'error', message: 'Saxlanmış kamera ayarları etibarlı deyil. Parametrləri yenidən saxlayın.' });
    }
  }

  async getSettings(): Promise<LiveCameraSettings | null> {
    await this.load();
    return this.stored ? { ...this.stored.settings, hasPassword: !!this.stored.encryptedPassword } : null;
  }

  async saveSettings(value: unknown): Promise<LiveCameraSettings> {
    await this.load();
    const input = validateCameraSettings(value);
    const { password, ...settings } = input;
    let encryptedPassword = this.stored?.encryptedPassword ?? '';
    if (password) {
      if (!this.secureStorageAvailable()) throw new CameraSettingsError('Sistem şifrəni təhlükəsiz saxlaya bilmir. macOS Keychain və ya sistem açar anbarını aktiv edin.');
      try {
        encryptedPassword = safeStorage.encryptString(password).toString('base64');
      } catch {
        throw new CameraSettingsError('Kamera şifrəsi sistem açar anbarında saxlanmadı.');
      }
    } else if (this.stored && (this.stored.settings.host !== input.host || this.stored.settings.username !== input.username)) {
      throw new CameraSettingsError('Yeni kamera və ya istifadəçi üçün şifrə daxil edin.');
    }
    if (!encryptedPassword) throw new CameraSettingsError('Kameranın lokal giriş şifrəsini daxil edin.');
    const stored: StoredCamera = { version: 1, settings, encryptedPassword };
    const tempPath = `${this.settingsPath}.tmp`;
    try {
      await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
      await fs.writeFile(tempPath, JSON.stringify(stored), { mode: 0o600 });
      await fs.chmod(tempPath, 0o600);
      await fs.rename(tempPath, this.settingsPath);
    } catch {
      await fs.unlink(tempPath).catch(() => {});
      throw new CameraSettingsError('Kamera ayarları diskdə saxlanmadı.');
    }
    const identityChanged = !this.stored || password || this.stored.settings.host !== settings.host ||
      this.stored.settings.port !== settings.port || this.stored.settings.username !== settings.username ||
      this.stored.settings.streamPath !== settings.streamPath;
    if (identityChanged) this.disconnect();
    this.stored = stored;
    return { ...settings, hasPassword: true };
  }

  getStatus(): LiveCameraStatus {
    return { ...this.status };
  }

  private trustedWindow(): WebContents | null {
    const contents = getMainWindow()?.webContents;
    return contents && !contents.isDestroyed() && isAppUrl(contents.getURL()) ? contents : null;
  }

  private setStatus(status: LiveCameraStatus): void {
    this.status = status;
    this.trustedWindow()?.send(CAMERA_IPC.status, status);
  }

  ack(at?: unknown): void {
    // A delayed ACK from an old stream/reload cannot release a newer frame.
    if (at === undefined || (typeof at === 'number' && Number.isFinite(at) && at === this.pendingAckAt)) {
      this.pendingAckAt = null;
    }
  }

  private async findFfmpeg(): Promise<string | null> {
    const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const candidates = [
      path.join(process.resourcesPath, executable),
      ...(process.platform === 'win32' ? [] : ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/bin/ffmpeg']),
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate, constants.X_OK);
        return candidate;
      } catch { /* Try the next known installation path. */ }
    }
    return null;
  }

  async connect(): Promise<void> {
    await this.load();
    if (!this.stored) throw new CameraSettingsError('Əvvəl kamera parametrlərini saxlayın.');
    this.disconnect();
    this.desired = true;
    this.retries = 0;
    await this.startAttempt(this.generation);
  }

  disconnect(): void {
    this.desired = false;
    this.generation += 1;
    this.clearTimers();
    this.pendingAckAt = null;
    this.stopChild();
    this.setStatus({ state: 'idle' });
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.retryTimer = null;
    this.watchdog = null;
  }

  private stopChild(): void {
    const child = this.child;
    this.child = null;
    if (!child) return;
    child.kill('SIGTERM');
    // A network decoder should not hold the application open indefinitely.
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 1000);
    timer.unref();
  }

  private async startAttempt(generation: number): Promise<void> {
    if (!this.desired || generation !== this.generation || !this.stored) return;
    this.setStatus({ state: 'connecting', message: 'Real kameranın RTSP axınına qoşulur…' });
    const executable = await this.findFfmpeg();
    if (!this.desired || generation !== this.generation) return;
    if (!executable) {
      this.desired = false;
      this.setStatus({ state: 'error', message: 'FFmpeg tapılmadı. Canlı kamera üçün FFmpeg quraşdırılmalıdır.' });
      return;
    }
    let password: string;
    try {
      if (!this.secureStorageAvailable()) throw new Error('unavailable');
      password = safeStorage.decryptString(Buffer.from(this.stored.encryptedPassword, 'base64'));
    } catch {
      this.desired = false;
      this.setStatus({ state: 'error', message: 'Saxlanmış şifrə açıla bilmədi. Kamera şifrəsini yenidən daxil edib saxlayın.' });
      return;
    }
    const inputUrl = makeRtspUrl(this.stored.settings as LiveCameraSettingsInput, password);
    // No shell, no process diagnostics or arguments are logged or sent to UI.
    const child = spawn(executable, [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-rtsp_transport', 'tcp', '-timeout', '10000000',
      '-i', inputUrl, '-map', '0:v:0', '-an', '-sn', '-dn',
      '-vf', `fps=${APP_CONFIG.camera.previewFps},scale=1280:720:force_original_aspect_ratio=decrease`,
      '-threads', '2', '-c:v', 'mjpeg', '-q:v', '5',
      '-f', 'image2pipe', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
    this.child = child;
    this.lastFrame = 0;
    this.pendingAckAt = null;
    const startedAt = Date.now();
    let diagnosticTail = '';
    const parser = new MjpegParser((bytes) => {
      if (!this.desired || generation !== this.generation || this.child !== child) return;
      this.lastFrame = Date.now();
      this.retries = 0;
      if (this.status.state !== 'live') this.setStatus({ state: 'live', message: 'Real kamera görüntüsü alınır.' });
      const contents = this.trustedWindow();
      if (contents && this.pendingAckAt === null) {
        this.pendingAckAt = this.lastFrame;
        contents.send(CAMERA_IPC.frame, { bytes, at: this.lastFrame });
      }
    });
    child.stdout?.on('data', (chunk: Buffer) => parser.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => {
      // Only a bounded private buffer is inspected; never display this text.
      diagnosticTail = (diagnosticTail + chunk.toString('utf8')).slice(-4096);
    });
    let finished = false;
    const finish = () => {
      if (finished || !this.desired || generation !== this.generation || this.child !== child) return;
      finished = true;
      const message = classifyCameraFailure(diagnosticTail);
      if (/\b401\b|unauthori[sz]ed|authentication failed/i.test(diagnosticTail)) {
        // Repeating rejected credentials can lock a camera account.
        this.desired = false;
        this.clearTimers();
        this.stopChild();
        this.setStatus({ state: 'error', message });
      } else {
        this.scheduleRetry(generation, message);
      }
      diagnosticTail = '';
    };
    child.on('error', finish);
    child.on('close', finish);
    // Never allow child pipe errors to reach main's generic raw-error logger.
    child.stdout?.on('error', finish);
    child.stderr?.on('error', finish);
    this.watchdog = setInterval(() => {
      const deadline = this.lastFrame ? FRAME_TIMEOUT_MS : CONNECTION_TIMEOUT_MS;
      if (Date.now() - (this.lastFrame || startedAt) > deadline) finish();
    }, 1000);
    this.watchdog.unref();
  }

  private scheduleRetry(generation: number, message: string): void {
    this.clearTimers();
    this.stopChild();
    if (!this.desired || generation !== this.generation) return;
    this.setStatus({ state: 'offline', message });
    const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** Math.min(this.retries, 5));
    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.startAttempt(generation).catch(() => {
        this.desired = false;
        this.setStatus({ state: 'error', message: 'Kamera axını başladıla bilmədi. Parametrləri yoxlayın.' });
      });
    }, delay);
    this.retryTimer.unref();
  }
}

function assertTrustedSender(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): void {
  const window = getMainWindow();
  if (!window || event.sender !== window.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame || !isAppUrl(event.senderFrame.url)) {
    throw new CameraSettingsError('Kamera əməliyyatına icazə verilmədi.');
  }
}

/** Register a small, fixed bridge rather than exposing arbitrary IPC/fs/spawn. */
export function setupLiveCamera(): () => void {
  const service = new LiveCameraService();
  app.on('web-contents-created', (_event, contents) => {
    // A reload loses its old preload listener and must release its pending ACK.
    contents.on('did-finish-load', () => {
      if (getMainWindow()?.webContents === contents) service.ack();
    });
    contents.on('render-process-gone', () => {
      if (getMainWindow()?.webContents === contents) service.ack();
    });
  });
  // Serialize calls so saves/connect/disconnect cannot race each other on disk.
  let sequence = Promise.resolve<unknown>(undefined);
  function handle(channel: string, operation: (input: unknown) => unknown) {
    ipcMain.handle(channel, (event, input: unknown) => {
      assertTrustedSender(event);
      const result = sequence.then(() => operation(input)).catch((error: unknown) => {
        if (error instanceof CameraSettingsError) throw error;
        throw new CameraSettingsError('Kamera əməliyyatı tamamlanmadı. Parametrləri yoxlayın.');
      });
      sequence = result.catch(() => undefined);
      return result;
    });
  }
  handle(CAMERA_IPC.getSettings, () => service.getSettings());
  handle(CAMERA_IPC.saveSettings, (input) => service.saveSettings(input));
  handle(CAMERA_IPC.connect, () => service.connect());
  handle(CAMERA_IPC.disconnect, () => service.disconnect());
  handle(CAMERA_IPC.getStatus, () => service.getStatus());
  ipcMain.on(CAMERA_IPC.frameAck, (event, at: unknown) => {
    try {
      assertTrustedSender(event);
      service.ack(at);
    } catch { /* Untrusted frames never control the stream. */ }
  });
  return () => service.disconnect();
}
