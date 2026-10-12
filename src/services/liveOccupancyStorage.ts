import type { CameraZone, OccupancySnapshot, OccupancyTimeline, ZoneStatus } from '@/types';

export const LIVE_OCCUPANCY_STORAGE_KEY = 'restaurant-camera.live-occupancy.v1';
const MAX_TIMELINE_SEGMENTS = 256;
const MAX_EVENTS = 40;
const STATUS: readonly ZoneStatus[] = ['empty', 'arriving', 'occupied'];

export interface SavedLiveOccupancy {
  version: 1;
  signature: string;
  snapshot: OccupancySnapshot;
  timeline: OccupancyTimeline;
}

/** Camera endpoint and geometry only. Credentials never reach this storage. */
export function liveOccupancySignature(zones: readonly CameraZone[], sourceKey: string): string {
  return JSON.stringify({ sourceKey, zones });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function seconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Validate persisted data before it is allowed to restore a live visit. */
export function parseLiveOccupancy(raw: string | null, signature: string, zones: readonly CameraZone[]): SavedLiveOccupancy | null {
  if (!raw || raw.length > 1_000_000) return null;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!record(saved) || saved.version !== 1 || saved.signature !== signature) return null;
    const snapshot = saved.snapshot;
    const timeline = saved.timeline;
    if (!record(snapshot) || !record(timeline) || !seconds(snapshot.time) || !Number.isSafeInteger(snapshot.session) || Number(snapshot.session) < 1) return null;
    if (!Array.isArray(snapshot.zones) || snapshot.zones.length !== zones.length || !Array.isArray(snapshot.events) || snapshot.events.length > MAX_EVENTS) return null;
    const ids = new Set(zones.map((zone) => zone.id));
    const seen = new Set<string>();
    for (const zone of snapshot.zones) {
      if (!record(zone) || typeof zone.zoneId !== 'string' || !ids.has(zone.zoneId) || seen.has(zone.zoneId)) return null;
      seen.add(zone.zoneId);
      if (!STATUS.includes(zone.status as ZoneStatus) || !Number.isSafeInteger(zone.people) || Number(zone.people) < 0 || typeof zone.hidden !== 'boolean') return null;
      if (zone.visitStart !== null && (!seconds(zone.visitStart) || zone.visitStart > snapshot.time)) return null;
      if (zone.lastSeen !== null && (!seconds(zone.lastSeen) || zone.lastSeen > snapshot.time)) return null;
      if (zone.status === 'occupied' && zone.visitStart === null) return null;
    }
    for (const event of snapshot.events) {
      if (!record(event) || typeof event.zoneId !== 'string' || !ids.has(event.zoneId)) return null;
      if (!['seated', 'left', 'passedBy'].includes(String(event.kind)) || !seconds(event.at) || event.at > snapshot.time || !Number.isSafeInteger(event.id) || Number(event.id) < 1) return null;
      if (!Number.isSafeInteger(event.session) || event.session !== snapshot.session) return null;
      if (event.duration !== undefined && !seconds(event.duration)) return null;
    }
    if (timeline.session !== snapshot.session || !record(timeline.zones)) return null;
    for (const [id, segments] of Object.entries(timeline.zones)) {
      if (!ids.has(id) || !Array.isArray(segments) || segments.length > MAX_TIMELINE_SEGMENTS) return null;
      let previous = 0;
      for (const segment of segments) {
        if (!record(segment) || !STATUS.includes(segment.status as ZoneStatus) || !seconds(segment.from) || !seconds(segment.to)) return null;
        if (segment.from < previous || segment.to < segment.from || segment.to > snapshot.time) return null;
        previous = segment.to;
      }
    }
    return saved as unknown as SavedLiveOccupancy;
  } catch {
    return null;
  }
}

export function boundedLiveTimeline(timeline: OccupancyTimeline): OccupancyTimeline {
  return { session: timeline.session, zones: Object.fromEntries(Object.entries(timeline.zones).map(([id, segments]) => [id, segments.slice(-MAX_TIMELINE_SEGMENTS)])) };
}

export function readLiveOccupancy(signature: string, zones: readonly CameraZone[]): SavedLiveOccupancy | null {
  try {
    return parseLiveOccupancy(window.localStorage.getItem(LIVE_OCCUPANCY_STORAGE_KEY), signature, zones);
  } catch {
    return null;
  }
}

export function saveLiveOccupancy(signature: string, snapshot: OccupancySnapshot, timeline: OccupancyTimeline): void {
  try {
    const saved: SavedLiveOccupancy = { version: 1, signature, snapshot, timeline: boundedLiveTimeline(timeline) };
    window.localStorage.setItem(LIVE_OCCUPANCY_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Local occupancy history is optional when browser storage is unavailable.
  }
}
