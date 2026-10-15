import type { CameraZone, NormalizedPoint } from '../../src/types/camera';
import type { LiveCameraSettingsInput } from '../../src/types/liveCamera';
import { rotateCameraZones } from '../../src/utils/cameraOrientation';

/** Errors are deliberately fixed messages: never interpolate caller input. */
export class CameraSettingsError extends Error {}

function invalid(): never {
  throw new CameraSettingsError('Kamera parametrləri düzgün deyil. Lokal IP, RTSP portu və zonaları yoxlayın.');
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || hasControlCharacters(value)) return invalid();
  return value.trim();
}

export function isPrivateCameraHost(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split('.').map(Number);
  if (octets.some((part, i) => part > 255 || String(part) !== host.split('.')[i])) return false;
  const [a, b, , d] = octets;
  return d !== 0 && d !== 255 && (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
}

function validatePoint(value: unknown): NormalizedPoint {
  const point = record(value);
  if (typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return invalid();
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return invalid();
  return { x: point.x, y: point.y };
}

function validateZones(value: unknown): CameraZone[] {
  if (!Array.isArray(value) || value.length > 32) return invalid();
  const ids = new Set<string>();
  return value.map((entry) => {
    const zone = record(entry);
    const id = text(zone.id, 64);
    const label = text(zone.label, 40);
    if (!/^[\w-]+$/.test(id) || ids.has(id)) return invalid();
    ids.add(id);
    if (!Array.isArray(zone.polygon) || zone.polygon.length < 3 || zone.polygon.length > 16) return invalid();
    const polygon = zone.polygon.map(validatePoint);
    // A line or repeated points cannot describe a useful occupancy zone.
    const area = polygon.reduce((sum, p, i) => {
      const next = polygon[(i + 1) % polygon.length];
      return sum + p.x * next.y - next.x * p.y;
    }, 0);
    if (Math.abs(area) < 0.00001) return invalid();
    return { id, label, polygon };
  });
}

/** Reject URLs/hostnames/extra credentials; the backend connects only to a local camera. */
export function validateCameraSettings(value: unknown): LiveCameraSettingsInput {
  const input = record(value);
  const name = text(input.name, 80);
  const host = text(input.host, 15);
  if (!isPrivateCameraHost(host)) return invalid();
  if (typeof input.port !== 'number' || !Number.isInteger(input.port) || input.port < 1 || input.port > 65535) return invalid();
  const username = text(input.username, 64);
  const streamPath = text(input.streamPath, 160);
  if (!/^\/[a-zA-Z0-9/_\-.]+$/.test(streamPath) || streamPath.includes('..') || streamPath.includes('//')) return invalid();
  let password: string | undefined;
  if (input.password !== undefined) {
    if (typeof input.password !== 'string' || input.password.length > 256 || hasControlCharacters(input.password)) return invalid();
    password = input.password;
  }
  const legacyOrientation = !Object.hasOwn(input, 'rotation');
  if (!legacyOrientation && input.rotation !== 0 && input.rotation !== 180) return invalid();
  const rotation = legacyOrientation || input.rotation === 180 ? 180 : 0;
  const zones = validateZones(input.zones);
  // Legacy zones were drawn on the inverted stream. The explicit orientation
  // returned here marks their migration, so subsequent saves never rotate twice.
  return {
    name, host, port: input.port, username, streamPath, rotation,
    zones: legacyOrientation ? rotateCameraZones(zones) : zones,
    ...(password === undefined ? {} : { password }),
  };
}

export function makeRtspUrl(settings: LiveCameraSettingsInput, password: string): string {
  return `rtsp://${encodeURIComponent(settings.username)}:${encodeURIComponent(password)}@${settings.host}:${settings.port}${settings.streamPath}`;
}

/** Child-process diagnostics stay in main and are reduced to a safe category. */
export function classifyCameraFailure(stderr: string): string {
  if (/\b401\b|unauthori[sz]ed|authentication failed/i.test(stderr)) return 'Giriş qəbul edilmədi. İstifadəçi adını və kamera şifrəsini yoxlayın.';
  if (/\b404\b|not found/i.test(stderr)) return 'RTSP axın yolu tapılmadı. Kamera üçün axın yolunu yoxlayın.';
  return 'Kamera axını əlçatan deyil. Elektrik, şəbəkə və RTSP ayarlarını yoxlayın. Yenidən qoşulma sınanır.';
}
