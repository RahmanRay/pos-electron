import type { LiveCameraFrame } from '../src/types/liveCamera';

/** Keep ACK delivery independent of React mounting/unmounting its listener. */
export class CameraFrameDispatcher {
  private readonly subscribers = new Set<(frame: LiveCameraFrame) => void>();

  constructor(private readonly acknowledge: (at: number) => void) {}

  subscribe(callback: (frame: LiveCameraFrame) => void): () => void {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  }

  dispatch(frame: LiveCameraFrame): void {
    try {
      for (const callback of this.subscribers) {
        try {
          callback({ bytes: new Uint8Array(frame.bytes), at: frame.at });
        } catch {
          // A page callback must not break the bridge or expose raw errors.
        }
      }
    } finally {
      // No subscribers means drop the frame, then release the main queue.
      this.acknowledge(frame.at);
    }
  }
}
