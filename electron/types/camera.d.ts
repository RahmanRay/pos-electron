import type { LiveCameraAPI } from '../../src/types/liveCamera';

declare global {
  interface Window {
    cameraAPI?: LiveCameraAPI;
  }
}
