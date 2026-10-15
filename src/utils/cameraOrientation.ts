import type { CameraZone } from '../types/camera';

/** Keep saved table areas on the same physical seats after a half-turn. */
export function rotateCameraZones(zones: readonly CameraZone[]): CameraZone[] {
  return zones.map((zone) => ({
    ...zone,
    polygon: zone.polygon.map(({ x, y }) => ({ x: 1 - x, y: 1 - y })),
  }));
}
