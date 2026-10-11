import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { APP_CONFIG } from '@/config/app.config';
import { loadPersonDetector, type PersonDetector } from '@/services/cameraDetector';
import { useCameraStore } from '@/store/cameraStore';

/** A loop restarts the video near 0 s; seeks further in are not loops. */
const LOOP_RESTART_MAX_SEC = 0.5;

/**
 * Drives the simulated camera: plays the local clip in a loop at the configured speed,
 * analyses a frame every `detectIntervalMs`, starts a new demo session when the
 * clip loops, and flags the feed as stalled when the picture stops moving.
 */
export function useCameraDemo(videoRef: RefObject<HTMLVideoElement | null>) {
  const userPaused = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const camera = useCameraStore.getState;
    let disposed = false;
    let detector: PersonDetector | null = null;
    let lastMediaTime = -1;
    let lastAdvanceAt = performance.now();

    camera().setFeed('loading');
    camera().setSimulatingStall(false);
    userPaused.current = false;

    const { playbackRate } = APP_CONFIG.camera;
    video.defaultPlaybackRate = playbackRate;
    video.playbackRate = playbackRate;

    const onPlaying = () => {
      lastAdvanceAt = performance.now();
      if (!camera().simulatingStall) camera().setFeed('live');
    };
    const onError = () => {
      // MEDIA_ERR_SRC_NOT_SUPPORTED is what a missing file looks like.
      camera().setFeed(video.error?.code === 4 ? 'missing' : 'error');
    };
    const onSeeked = () => {
      if (video.currentTime < LOOP_RESTART_MAX_SEC) camera().restartSession();
    };
    // Some browsers reset the rate when the source loads or loops; keep it fixed.
    const onRateChange = () => {
      if (video.playbackRate !== playbackRate) video.playbackRate = playbackRate;
    };
    const onMetadata = () => {
      camera().setDuration(video.duration);
      onRateChange();
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ratechange', onRateChange);
    video.addEventListener('loadedmetadata', onMetadata);
    if (video.readyState >= 1) onMetadata();
    if (video.error) onError();
    void video.play().catch(() => undefined);

    // Watchdog: the picture must keep moving unless the user paused it.
    const watchdog = window.setInterval(() => {
      const { feed } = camera();
      if (feed === 'missing' || feed === 'error' || feed === 'loading' || userPaused.current) return;
      const now = performance.now();
      if (video.currentTime !== lastMediaTime) {
        lastMediaTime = video.currentTime;
        lastAdvanceAt = now;
        if (feed === 'stalled') camera().setFeed('live');
      } else if (now - lastAdvanceAt >= APP_CONFIG.camera.stallAfterMs && feed !== 'stalled') {
        camera().setFeed('stalled');
      }
    }, 250);

    // Detection loop.
    camera().setDetector('loading');
    void (async () => {
      // One retry: a large model fetch can fail once on a busy disk cache.
      for (let attempt = 1; !detector && !disposed; attempt++) {
        try {
          detector = await loadPersonDetector();
        } catch (error) {
          console.error(`[camera] detector failed to load (attempt ${attempt})`, error);
          if (attempt >= 2) {
            if (!disposed) camera().setDetector('error');
            return;
          }
        }
      }
      if (!detector) return;
      if (disposed) {
        detector.dispose();
        return;
      }
      camera().setDetector('ready');
      let lastAnalysed = -1;
      while (!disposed) {
        const startedAt = performance.now();
        const mediaTime = video.currentTime;
        if (camera().feed === 'live' && !video.paused && video.readyState >= 2 && mediaTime !== lastAnalysed) {
          try {
            const people = await detector.detect(video);
            // A result that straddles a loop belongs to the old session: drop it.
            if (!disposed && video.currentTime >= mediaTime - 0.25) {
              camera().applyFrame(mediaTime, people, performance.now() - startedAt);
            }
            lastAnalysed = mediaTime;
          } catch (error) {
            console.error('[camera] detection failed', error);
          }
        }
        const wait = Math.max(0, APP_CONFIG.camera.detectIntervalMs - (performance.now() - startedAt));
        await new Promise((resolve) => window.setTimeout(resolve, wait));
      }
    })();

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ratechange', onRateChange);
      video.removeEventListener('loadedmetadata', onMetadata);
      video.pause();
      detector?.dispose();
    };
  }, [videoRef]);

  const togglePause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const camera = useCameraStore.getState();
    if (userPaused.current) {
      userPaused.current = false;
      if (!camera.simulatingStall) void video.play().catch(() => undefined);
    } else {
      userPaused.current = true;
      video.pause();
      camera.setFeed('paused');
    }
  }, [videoRef]);

  /** Test: freezes the picture without telling anyone, as a hung camera would. The watchdog must notice. */
  const toggleStallSimulation = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const camera = useCameraStore.getState();
    if (camera.simulatingStall) {
      camera.setSimulatingStall(false);
      if (!userPaused.current) void video.play().catch(() => undefined);
    } else {
      camera.setSimulatingStall(true);
      video.pause();
    }
  }, [videoRef]);

  const restart = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // The `seeked` handler starts the new session.
    video.currentTime = 0;
  }, [videoRef]);

  return { togglePause, toggleStallSimulation, restart };
}
