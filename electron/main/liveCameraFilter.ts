import { APP_CONFIG } from '../../src/config/app.config';
import type { CameraRotation } from '../../src/types/liveCamera';

/** Correct the pixels before JPEG delivery so display and detection agree. */
export function buildCameraVideoFilter(rotation: CameraRotation): string {
  return [
    `fps=${APP_CONFIG.camera.previewFps}`,
    ...(rotation === 180 ? ['hflip', 'vflip'] : []),
    'scale=1280:720:force_original_aspect_ratio=decrease',
  ].join(',');
}
