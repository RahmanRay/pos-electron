/* Camera occupancy demo. Nothing here is persisted and nothing here touches
   orders, tables or payments: the camera page only observes. */

/** A point in normalized video coordinates (0…1 on both axes, origin top-left). */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** A table area drawn on the camera picture. */
export interface CameraZone {
  id: string;
  /** Short label painted on the video ("A", "B"…). */
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
  /** Media time (s) when the current visit started (first frame with someone in the zone). */
  visitStart: number | null;
  /** Media time (s) when someone was last seen in the zone. */
  lastSeen: number | null;
  /** Occupied but nobody visible right now (short occlusion / missed detection). */
  hidden: boolean;
}

export type OccupancyEventKind = 'seated' | 'left' | 'passedBy';

export interface OccupancyEvent {
  id: number;
  kind: OccupancyEventKind;
  zoneId: string;
  /** Media time (s) of the event. */
  at: number;
  /** Seconds the visit lasted (left / passedBy). */
  duration?: number;
  /** Demo session (loop) the event belongs to. */
  session: number;
}

export interface OccupancySnapshot {
  /** Increments every time the video loops; a new session starts from empty. */
  session: number;
  /** Latest media time processed (s). */
  time: number;
  zones: ZoneOccupancy[];
  events: OccupancyEvent[];
}

export interface CameraSourceInfo {
  title: string;
  /** Public page of the source (for attribution / checking the license). */
  pageUrl: string;
  author: string;
  license: string;
  /** True when the footage is a time-lapse: timers then count video seconds, not real time. */
  timeLapse: boolean;
  /** Local file path served next to index.html. */
  videoPath: string;
}

/** State of the simulated camera feed. */
export type FeedStatus = 'loading' | 'missing' | 'live' | 'paused' | 'stalled' | 'error';

/** A stretch of video time during which a zone kept one status. */
export interface TimelineSegment {
  status: ZoneStatus;
  from: number;
  to: number;
}

/** Status history of every zone in one demo session. */
export interface OccupancyTimeline {
  session: number;
  zones: Record<string, TimelineSegment[]>;
}
