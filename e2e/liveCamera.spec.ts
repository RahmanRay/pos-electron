import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createUserDataDir, launchApp, removeUserDataDir, type LaunchedApp } from './helpers';

// Synthetic test credentials/frames never contact the user's camera.
const testPassword = 'synthetic-e2e-credential-only';
let userDataDir: string;
let launched: LaunchedApp;

test.beforeAll(async () => {
  userDataDir = createUserDataDir();
  launched = await launchApp(userDataDir);
});

test.afterAll(async () => {
  await launched?.app.close();
  removeUserDataDir(userDataDir);
});

test('live settings save encrypted credentials and survive reload without returning a password', async () => {
  const page = launched.window;
  await expect(page.getByTestId('live-camera-page')).toBeVisible();
  await expect(page.getByTestId('live-camera-status')).toHaveText('Qoşulmayıb');
  await page.locator('[name="camera-host"]').fill('192.168.72.253');
  const password = page.locator('[name="camera-password"]');
  await expect(password).toHaveAttribute('type', 'password');
  await password.fill(testPassword);
  await page.getByRole('button', { name: 'Saxla', exact: true }).click();
  await expect(page.getByText('Parametrlər saxlanıldı.', { exact: true })).toBeVisible();
  await expect(password).toHaveValue('');
  const settings = await page.evaluate(() => window.cameraAPI!.getSettings());
  expect(settings).toMatchObject({ host: '192.168.72.253', port: 554, hasPassword: true, zones: [] });
  expect(settings).not.toHaveProperty('password');
  const stored = fs.readFileSync(path.join(userDataDir, 'live-camera.json'), 'utf8');
  expect(stored).not.toContain(testPassword);
  expect(JSON.parse(stored).encryptedPassword).toBeTruthy();
  expect(fs.statSync(path.join(userDataDir, 'live-camera.json')).mode & 0o777).toBe(0o600);
  await page.reload();
  await expect(page.locator('[name="camera-host"]')).toHaveValue('192.168.72.253');
  await expect(page.locator('[name="camera-password"]')).toHaveValue('');
  await expect(page.getByTestId('live-camera-status')).toHaveText('Qoşulmayıb');
});

test('main-to-preload JPEG rendering recovers from a corrupt frame and accepts user-drawn zones', async () => {
  const page = launched.window;
  // This exercises IPC and image decoding with an explicitly synthetic JPEG.
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#cc2222';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return Array.from(atob(canvas.toDataURL('image/jpeg').split(',')[1]), (c) => c.charCodeAt(0));
  });
  await launched.app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.send('camera:status', { state: 'live' });
    contents.send('camera:frame', { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), at: Date.now() });
  });
  await expect(page.getByTestId('live-camera-status')).toHaveText('Bağlantı xətası');
  await launched.app.evaluate(({ BrowserWindow }, frame) => {
    BrowserWindow.getAllWindows()[0].webContents.send('camera:frame', { bytes: Buffer.from(frame), at: Date.now() });
  }, bytes);
  await expect(page.getByTestId('live-camera-status')).toHaveText('Canlı görüntü');
  await expect.poll(() => page.getByTestId('live-camera-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return canvas.width === 320 && canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data[0] > 190;
  })).toBe(true);
  await page.getByRole('button', { name: 'Zona çək', exact: true }).click();
  const overlay = page.locator('svg[aria-label="Masa zonasını çəkin"]');
  const bounds = (await overlay.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.1, bounds.y + bounds.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.6);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(async () => (await window.cameraAPI!.getSettings())?.zones.length)).toBe(1);
  const zone = await page.evaluate(async () => (await window.cameraAPI!.getSettings())!.zones[0]);
  expect(zone.id).toBe('1');
  expect(zone.polygon[0].x).toBeCloseTo(0.1, 2);
  expect(zone.polygon[2].y).toBeCloseTo(0.6, 2);
});

test('preview keeps drawing smoothly while the detector analyses a separate snapshot', async () => {
  const page = launched.window;
  // Synthetic IPC cadence measures the renderer, not the physical camera.
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext('2d')!;
    for (let y = 0; y < 720; y += 20) {
      for (let x = 0; x < 1280; x += 20) {
        context.fillStyle = `rgb(${x % 255},${y % 255},${(x + y) % 255})`;
        context.fillRect(x, y, 20, 20);
      }
    }
    return Array.from(atob(canvas.toDataURL('image/jpeg').split(',')[1]), (c) => c.charCodeAt(0));
  });
  await expect(page.getByText(/^\d[\d ]* ms$/)).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const scope = globalThis as unknown as { previewMeasurement: { count: number; started: number; finished: number } };
    scope.previewMeasurement = { count: 0, started: performance.now(), finished: 0 };
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: [CanvasImageSource, ...number[]]) {
      if (this.canvas.dataset.testid === 'live-camera-canvas') {
        scope.previewMeasurement.count++;
        scope.previewMeasurement.finished = performance.now();
      }
      Reflect.apply(original, this, args);
    };
  });
  await launched.app.evaluate(({ BrowserWindow }, frame) => new Promise<void>((resolve) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    const jpeg = Buffer.from(frame);
    const interval = setInterval(() => contents.send('camera:frame', { bytes: jpeg, at: Date.now() }), 40);
    setTimeout(() => { clearInterval(interval); resolve(); }, 4000);
  }), bytes);
  const measurement = await page.evaluate(() => {
    const { count, started, finished } = (globalThis as unknown as { previewMeasurement: { count: number; started: number; finished: number } }).previewMeasurement;
    return { count, fps: count / ((finished - started) / 1000) };
  });
  expect(measurement.count).toBeGreaterThan(60);
  expect(measurement.fps).toBeGreaterThan(15);
  await expect(page.getByTestId('live-camera-status')).toHaveText('Canlı görüntü');
  console.info(`Synthetic preview: ${measurement.fps.toFixed(1)} FPS during active inference`);
});

test('offline and reload show restored zones as unconfirmed instead of current occupancy', async () => {
  const page = launched.window;
  await launched.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('camera:status', { state: 'offline' });
  });
  await expect(page.getByTestId('live-camera-status')).toHaveText('Kamera offline');
  await expect(page.locator('[data-zone="1"]')).toHaveAttribute('data-status', 'unknown');
  await page.reload();
  await expect(page.getByTestId('live-camera-status')).toHaveText('Qoşulmayıb');
  await expect(page.locator('[data-zone="1"]')).toHaveAttribute('data-status', 'unknown');
  await expect(page.getByRole('button', { name: 'Zona çək', exact: true })).toBeDisabled();
});
