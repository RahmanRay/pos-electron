/* Camera occupancy observations; credentials belong to the Electron main process. */

/** A point in normalized video coordinates (0…1 on both axes, origin top-left). */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** A table area drawn on the camera picture. */
export interface CameraZone {
  id: string;
  /** Short table label painted on the camera image. */
  label: string;
  /** Polygon in normalized coordinates (at least 3 points). */
  polygon: readonly NormalizedPoint[];
}

/** A person found in one video frame (normalized box). */
export interface PersonDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

/**
 * - `empty`: nobody in the zone.
 * - `arriving`: someone is in the zone but not long enough to count (may be passing by).
 * - `occupied`: someone has stayed long enough; the seating timer runs.
 */
export type ZoneStatus = 'empty' | 'arriving' | 'occupied';

export interface ZoneOccupancy {
  zoneId: string;
  status: ZoneStatus;
  /** People currently seen in the zone (latest frame). */
  people: number;
  /** Observed time (s) when the current visit started. */
  visitStart: number | null;
  /** Observed time (s) when someone was last seen in the zone. */
  lastSeen: number | null;
  /** Occupied but nobody visible right now (short occlusion / missed detection). */
  hidden: boolean;
}

export type OccupancyEventKind = 'seated' | 'left' | 'passedBy';

export interface OccupancyEvent {
  id: number;
  kind: OccupancyEventKind;
  zoneId: string;
  /** Observed time (s) of the event. */
  at: number;
  /** Seconds the visit lasted (left / passedBy). */
  duration?: number;
  /** Tracking session the event belongs to. */
  session: number;
}

export interface OccupancySnapshot {
  /** Tracking session identifier. */
  session: number;
  /** Latest observed time processed (s). */
  time: number;
  zones: ZoneOccupancy[];
  events: OccupancyEvent[];
}

/** State of the camera feed. */
export type FeedStatus = 'loading' | 'missing' | 'live' | 'paused' | 'stalled' | 'error';

/** A stretch of observed time during which a zone kept one status. */
export interface TimelineSegment {
  status: ZoneStatus;
  from: number;
  to: number;
}

/** Status history of every zone in one tracking session. */
export interface OccupancyTimeline {
  session: number;
  zones: Record<string, TimelineSegment[]>;
}
