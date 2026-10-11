import { create } from 'zustand';
import { APP_CONFIG } from '@/config/app.config';
import { CAMERA_DEMO_ZONES } from '@/data/cameraDemo';
import type { FeedStatus, OccupancySnapshot, OccupancyTimeline, PersonDetection } from '@/types';
import { createOccupancyTracker, extendTimeline } from '@/utils/occupancy';

/* Camera demo state. In memory only: nothing is persisted or sent anywhere. */

export type DetectorStatus = 'loading' | 'ready' | 'error';

interface CameraState {
  feed: FeedStatus;
  detector: DetectorStatus;
  snapshot: OccupancySnapshot;
  timeline: OccupancyTimeline;
  /** Length of the clip (s); the timeline is drawn against it. */
  duration: number;
  /** People found in the latest analysed frame (for the overlay). */
  detections: PersonDetection[];
  /** Duration of the latest detection pass (ms). */
  inferenceMs: number | null;
  /** True while the "freeze the feed" test is running. */
  simulatingStall: boolean;

  setFeed: (feed: FeedStatus) => void;
  setDetector: (detector: DetectorStatus) => void;
  setDuration: (duration: number) => void;
  setSimulatingStall: (simulating: boolean) => void;
  applyFrame: (mediaTime: number, detections: PersonDetection[], inferenceMs: number) => void;
  /** Starts a new demo session (video looped / restarted). */
  restartSession: () => void;
}

const { seatAfterSec, seatMinPresence, passByGapSec, leaveAfterSec, maxEvents } = APP_CONFIG.camera;
const tracker = createOccupancyTracker(CAMERA_DEMO_ZONES, { seatAfterSec, seatMinPresence, passByGapSec, leaveAfterSec, maxEvents });

export const useCameraStore = create<CameraState>()((set) => ({
  feed: 'loading',
  detector: 'loading',
  snapshot: tracker.snapshot(),
  timeline: { session: tracker.snapshot().session, zones: {} },
  duration: 0,
  detections: [],
  inferenceMs: null,
  simulatingStall: false,

  setFeed: (feed) => set({ feed }),
  setDetector: (detector) => set({ detector }),
  setDuration: (duration) => set({ duration: Number.isFinite(duration) ? duration : 0 }),
  setSimulatingStall: (simulatingStall) => set({ simulatingStall }),
  // A media time earlier than the last frame (the video looped) starts a new session inside the tracker.
  applyFrame: (mediaTime, detections, inferenceMs) =>
    set((state) => {
      const snapshot = tracker.update(mediaTime, detections);
      return { snapshot, timeline: extendTimeline(state.timeline, snapshot), detections, inferenceMs };
    }),
  restartSession: () => {
    const snapshot = tracker.restart();
    set({ snapshot, timeline: { session: snapshot.session, zones: {} }, detections: [] });
  },
}));
