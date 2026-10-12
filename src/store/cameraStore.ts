import { create } from 'zustand';
import { APP_CONFIG } from '@/config/app.config';
import type { CameraZone, FeedStatus, OccupancySnapshot, OccupancyTimeline, PersonDetection } from '@/types';
import { createOccupancyTracker, extendTimeline } from '@/utils/occupancy';
import { boundedLiveTimeline, liveOccupancySignature, readLiveOccupancy, saveLiveOccupancy } from '@/services/liveOccupancyStorage';

/* Live occupancy history contains no camera credentials. */

export type DetectorStatus = 'loading' | 'ready' | 'error';

interface CameraState {
  zones: readonly CameraZone[];
  feed: FeedStatus;
  detector: DetectorStatus;
  snapshot: OccupancySnapshot;
  timeline: OccupancyTimeline;
  /** People found in the latest analysed frame (for the overlay). */
  detections: PersonDetection[];
  /** Duration of the latest detection pass (ms). */
  inferenceMs: number | null;
  setFeed: (feed: FeedStatus) => void;
  setDetector: (detector: DetectorStatus) => void;
  configureLive: (zones: readonly CameraZone[], sourceKey?: string) => void;
  applyLiveFrame: (wallClockSeconds: number, detections: PersonDetection[], inferenceMs: number) => void;
}

const { seatAfterSec, seatMinPresence, passByGapSec, leaveAfterSec, maxEvents } = APP_CONFIG.camera;
const options = { seatAfterSec, seatMinPresence, passByGapSec, leaveAfterSec, maxEvents };
let tracker = createOccupancyTracker([], options);
let liveSignature = '';
let lastLiveFrameAt: number | null = null;
let lastSavedAt = 0;

function persist(snapshot: OccupancySnapshot, timeline: OccupancyTimeline, force = false): void {
  if (!liveSignature) return;
  if (!force && Date.now() - lastSavedAt < 1000) return;
  saveLiveOccupancy(liveSignature, snapshot, timeline);
  lastSavedAt = Date.now();
}

export const useCameraStore = create<CameraState>()((set) => ({
  zones: [],
  feed: 'loading',
  detector: 'loading',
  snapshot: tracker.snapshot(),
  timeline: { session: tracker.snapshot().session, zones: {} },
  detections: [],
  inferenceMs: null,

  setFeed: (feed) => set((state) => {
    if (feed !== 'live') {
      lastLiveFrameAt = null;
      persist(state.snapshot, state.timeline, true);
    }
    return { feed };
  }),
  setDetector: (detector) => {
    if (detector !== 'ready') lastLiveFrameAt = null;
    set({ detector });
  },
  configureLive: (zones, sourceKey = '') => set((state) => {
    const signature = liveOccupancySignature(zones, sourceKey);
    if (signature === liveSignature) return state;
    persist(state.snapshot, state.timeline, true);
    const saved = readLiveOccupancy(signature, zones);
    tracker = createOccupancyTracker(zones, options, saved?.snapshot);
    liveSignature = signature;
    lastLiveFrameAt = null;
    lastSavedAt = 0;
    const snapshot = tracker.snapshot();
    const timeline = saved?.timeline ?? { session: snapshot.session, zones: {} };
    persist(snapshot, timeline, true);
    return { zones, snapshot, timeline, detections: [], inferenceMs: null };
  }),
  applyLiveFrame: (wallClockSeconds, detections, inferenceMs) => set((state) => {
    if (state.feed !== 'live' || state.detector !== 'ready' || !Number.isFinite(wallClockSeconds)) return state;
    if (lastLiveFrameAt !== null && wallClockSeconds <= lastLiveFrameAt) return state;
    const delta = lastLiveFrameAt === null ? 0 : Math.max(0, wallClockSeconds - lastLiveFrameAt);
    lastLiveFrameAt = wallClockSeconds;
    const snapshot = tracker.update(state.snapshot.time + delta, detections);
    const timeline = boundedLiveTimeline(extendTimeline(state.timeline, snapshot));
    persist(snapshot, timeline, snapshot.events.length !== state.snapshot.events.length);
    return { snapshot, timeline, detections, inferenceMs };
  }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const state = useCameraStore.getState();
    persist(state.snapshot, state.timeline, true);
  });
}
