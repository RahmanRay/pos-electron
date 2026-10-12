import { useEffect, useState, type RefObject } from 'react';
import { APP_CONFIG } from '@/config/app.config';
import { loadPersonDetector, type PersonDetector } from '@/services/cameraDetector';
import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import type { LiveCameraFrame, LiveCameraStatus } from '@/types/liveCamera';

/** JPEG frames originate in Electron's RTSP bridge; the renderer never receives credentials. */
export function useLiveCamera(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const [status, setStatus] = useState<LiveCameraStatus>({ state: 'idle' });
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    const api = window.cameraAPI;
    const canvas = canvasRef.current;
    if (!api || !canvas) return;
    const camera = useCameraStore.getState;
    const context = canvas.getContext('2d');
    if (!context) return;
    // Detection uses its own small snapshot; the visible canvas keeps drawing at
    // the stream's frame rate while TensorFlow works on a stable input image.
    const analysisCanvas = document.createElement('canvas');
    const analysisContext = analysisCanvas.getContext('2d', { alpha: false });
    if (!analysisContext) return;
    camera().setFeed('paused');
    camera().setDetector('loading');
    let disposed = false;
    let detector: PersonDetector | null = null;
    let pendingFrame: LiveCameraFrame | null = null;
    let drawing = false;
    let drawnAt = 0;
    let lastAnalysed = 0;
    let generation = 0;
    let displayFailed = false;
    const transport: { state: LiveCameraStatus['state'] } = { state: 'idle' };
    let statusReceived = false;

    const receiveStatus = (next: LiveCameraStatus) => {
      if (disposed) return;
      statusReceived = true;
      if (transport.state !== next.state && next.state !== 'live') generation++;
      transport.state = next.state;
      displayFailed = false;
      setStatus(next);
      camera().setFeed(
        next.state === 'live' ? 'live' : next.state === 'connecting' ? 'loading' :
          next.state === 'offline' ? 'stalled' : next.state === 'error' ? 'error' : 'paused',
      );
      if (next.state !== 'live') pendingFrame = null;
      if (next.state === 'connecting') {
        drawnAt = 0;
        lastAnalysed = 0;
        setHasFrame(false);
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    const removeStatus = api.onStatus(receiveStatus);
    void api.getStatus().then((initial) => {
      if (!statusReceived) receiveStatus(initial);
    }).catch(() => receiveStatus({ state: 'error', message: TEXT.cameraServiceError }));

    // Keep at most one pending JPEG; a slow renderer drops older frames.
    const drawPending = async () => {
      if (drawing || disposed) return;
      drawing = true;
      try {
        while (pendingFrame && !disposed) {
          const frame = pendingFrame;
          pendingFrame = null;
          const frameGeneration = generation;
          let bitmap: ImageBitmap | null = null;
          try {
            const data = new Uint8Array(frame.bytes);
            bitmap = await createImageBitmap(new Blob([data.buffer], { type: 'image/jpeg' }));
            if (!disposed && transport.state === 'live' && frameGeneration === generation) {
              if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
              }
              context.drawImage(bitmap, 0, 0);
              drawnAt = frame.at;
              setHasFrame(true);
              if (displayFailed) {
                displayFailed = false;
                setStatus({ state: 'live' });
                camera().setFeed('live');
              }
            }
          } catch {
            if (!disposed && transport.state === 'live' && frameGeneration === generation) {
              displayFailed = true;
              setStatus({ state: 'error', message: TEXT.cameraFrameError });
              camera().setFeed('error');
            }
          } finally {
            bitmap?.close();
          }
        }
      } finally {
        drawing = false;
      }
    };
    const removeFrame = api.onFrame((frame) => {
      if (disposed) return;
      pendingFrame = frame;
      void drawPending();
    });

    // Inference reads the displayed canvas; offline states never advance occupancy.
    void (async () => {
      try {
        for (let attempt = 0; !detector && !disposed && attempt < 2; attempt++) {
          try {
            detector = await loadPersonDetector();
          } catch {
            if (attempt === 1) throw new Error('Detector unavailable');
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
          }
        }
        if (disposed) return;
        if (!detector) return;
        camera().setDetector('ready');
        while (!disposed) {
          const startedAt = performance.now();
          const frameAt = drawnAt;
          const frameGeneration = generation;
          let inferenceFailed = false;
          if (transport.state === 'live' && frameAt > 0 && frameAt !== lastAnalysed) {
            try {
              const scale = Math.min(1, APP_CONFIG.camera.detectMaxWidth / canvas.width);
              const width = Math.max(1, Math.round(canvas.width * scale));
              const height = Math.max(1, Math.round(canvas.height * scale));
              if (analysisCanvas.width !== width || analysisCanvas.height !== height) {
                analysisCanvas.width = width;
                analysisCanvas.height = height;
              }
              analysisContext.drawImage(canvas, 0, 0, width, height);
              const people = await detector.detect(analysisCanvas);
              if (!disposed && transport.state === 'live' && frameGeneration === generation && frameAt > lastAnalysed) {
                camera().setDetector('ready');
                camera().applyLiveFrame(frameAt / 1000, people, performance.now() - startedAt);
                lastAnalysed = frameAt;
              }
            } catch {
              inferenceFailed = true;
              if (!disposed && frameGeneration === generation) camera().setDetector('error');
            }
          }
          const wait = inferenceFailed ? 2000 : Math.max(0, APP_CONFIG.camera.detectIntervalMs - (performance.now() - startedAt));
          await new Promise((resolve) => window.setTimeout(resolve, wait));
        }
      } catch {
        if (!disposed) camera().setDetector('error');
      } finally {
        detector?.dispose();
      }
    })();

    return () => {
      disposed = true;
      pendingFrame = null;
      removeFrame();
      removeStatus();
      void api.disconnect().catch(() => undefined);
    };
  }, [canvasRef]);

  return { status, hasFrame };
}
