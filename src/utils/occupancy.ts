import type {
  CameraZone,
  NormalizedPoint,
  OccupancyEvent,
  OccupancyEventKind,
  OccupancySnapshot,
  OccupancyTimeline,
  PersonDetection,
  TimelineSegment,
  ZoneOccupancy,
} from '@/types';

/*
 * Table occupancy from person detections (pure logic, no DOM).
 *
 * Time is media time in seconds. A zone goes
 *   empty → arriving   when a person shows up in it,
 *   arriving → occupied when someone was there for `seatAfterSec`
 *                       (in at least `seatMinPresence` of the frames),
 *   arriving → empty    when the person is gone for `passByGapSec` (passed by),
 *   occupied → empty    when nobody was seen for `leaveAfterSec` and at least
 *                       `leaveMinMisses` fresh analysed frames found nobody.
 * While occupied, frames without a person (someone walking in front, a missed
 * detection) only mark the zone `hidden`; the seating timer keeps running.
 */

export interface OccupancyOptions {
  seatAfterSec: number;
  seatMinPresence: number;
  passByGapSec: number;
  leaveAfterSec: number;
  /** Distinct missing observations required before confirming a departure. */
  leaveMinMisses?: number;
  maxEvents: number;
}

/** Media time going back by more than this is treated as a loop/restart of the video. */
const REWIND_TOLERANCE_SEC = 0.25;

/** Ray casting point-in-polygon test (normalized coordinates). */
export function pointInPolygon(point: NormalizedPoint, polygon: readonly NormalizedPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const crosses = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** The point that decides which table a person belongs to: the middle of the box (the camera looks down). */
export function detectionAnchor(detection: PersonDetection): NormalizedPoint {
  return { x: detection.x + detection.width / 2, y: detection.y + detection.height / 2 };
}

/** People per zone. A person counts for the first zone that contains their anchor point. */
export function countPeopleByZone(detections: readonly PersonDetection[], zones: readonly CameraZone[]): Map<string, number> {
  const counts = new Map<string, number>(zones.map((zone) => [zone.id, 0]));
  for (const detection of detections) {
    const anchor = detectionAnchor(detection);
    const zone = zones.find((candidate) => pointInPolygon(anchor, candidate.polygon));
    if (zone) counts.set(zone.id, (counts.get(zone.id) ?? 0) + 1);
  }
  return counts;
}

interface ZoneTrack extends ZoneOccupancy {
  samples: { t: number; present: boolean }[];
  misses: number;
}

function emptyTrack(zoneId: string): ZoneTrack {
  return { zoneId, status: 'empty', people: 0, visitStart: null, lastSeen: null, hidden: false, samples: [], misses: 0 };
}

export interface OccupancyTracker {
  /** Feed one analysed frame. Media time going backwards (video loop) starts a new session first. */
  update(time: number, detections: readonly PersonDetection[]): OccupancySnapshot;
  /** Forget observations and start a new tracking session. */
  restart(): OccupancySnapshot;
  snapshot(): OccupancySnapshot;
}

export function createOccupancyTracker(
  zones: readonly CameraZone[],
  options: OccupancyOptions,
  restored?: OccupancySnapshot,
): OccupancyTracker {
  const leaveMinMisses = options.leaveMinMisses ?? 3;
  let session = restored?.session ?? 1;
  let time = restored?.time ?? 0;
  let lastTime: number | null = restored?.time ?? null;
  let events: OccupancyEvent[] = restored?.events.slice(-options.maxEvents) ?? [];
  let nextEventId = Math.max(0, ...events.map((event) => event.id)) + 1;
  let tracks = zones.map((zone) => {
    const previous = restored?.zones.find((track) => track.zoneId === zone.id);
    // Pending arrivals cannot be confirmed across a restart. An occupied
    // visit keeps its measured duration, with fresh leave-grace on recovery.
    if (previous?.status !== 'occupied') return emptyTrack(zone.id);
    return { ...previous, people: 0, hidden: true, lastSeen: time, samples: [], misses: 0 } satisfies ZoneTrack;
  });

  function addEvent(kind: OccupancyEventKind, zoneId: string, at: number, duration?: number) {
    events = [...events, { id: nextEventId++, kind, zoneId, at, duration, session }].slice(-options.maxEvents);
  }

  function snapshot(): OccupancySnapshot {
    return {
      session,
      time,
      zones: tracks.map(({ samples: _samples, misses: _misses, ...zone }) => ({ ...zone })),
      events,
    };
  }

  function restart(): OccupancySnapshot {
    session += 1;
    time = 0;
    lastTime = null;
    events = [];
    tracks = zones.map((zone) => emptyTrack(zone.id));
    return snapshot();
  }

  function step(track: ZoneTrack, t: number, people: number) {
    const present = people > 0;
    track.people = people;
    track.samples.push({ t, present });
    track.samples = track.samples.filter((sample) => sample.t >= t - options.seatAfterSec);
    if (present) {
      track.lastSeen = t;
      track.misses = 0;
    } else if (track.status === 'occupied') {
      track.misses += 1;
    }

    switch (track.status) {
      case 'empty':
        if (present) {
          track.status = 'arriving';
          track.visitStart = t;
          track.samples = [{ t, present }];
        }
        break;
      case 'arriving': {
        const visitStart = track.visitStart ?? t;
        const lastSeen = track.lastSeen ?? visitStart;
        if (!present && t - lastSeen > options.passByGapSec) {
          addEvent('passedBy', track.zoneId, t, lastSeen - visitStart);
          Object.assign(track, emptyTrack(track.zoneId));
          break;
        }
        const presence = track.samples.filter((sample) => sample.present).length / track.samples.length;
        if (present && t - visitStart >= options.seatAfterSec && presence >= options.seatMinPresence) {
          track.status = 'occupied';
          addEvent('seated', track.zoneId, t);
        }
        break;
      }
      case 'occupied': {
        const lastSeen = track.lastSeen ?? t;
        track.hidden = !present;
        if (!present && track.misses >= leaveMinMisses && t - lastSeen >= options.leaveAfterSec) {
          addEvent('left', track.zoneId, t, lastSeen - (track.visitStart ?? lastSeen));
          Object.assign(track, emptyTrack(track.zoneId));
        }
        break;
      }
    }
  }

  function update(t: number, detections: readonly PersonDetection[]): OccupancySnapshot {
    if (lastTime !== null && t < lastTime - REWIND_TOLERANCE_SEC) restart();
    // Duplicate or slightly older frames (decoder jitter) are ignored.
    if (lastTime !== null && t <= lastTime) return snapshot();
    lastTime = t;
    time = t;
    const counts = countPeopleByZone(detections, zones);
    for (const track of tracks) step(track, t, counts.get(track.zoneId) ?? 0);
    return snapshot();
  }

  return { update, restart, snapshot };
}

/** Seconds a zone has been occupied at media time `now` (null when it is not occupied). */
export function seatedSeconds(zone: ZoneOccupancy, now: number): number | null {
  if (zone.status !== 'occupied' || zone.visitStart === null) return null;
  return Math.max(0, now - zone.visitStart);
}

/**
 * Adds the snapshot to the status history (one segment per unchanged stretch).
 * A new session (video looped) starts an empty history.
 */
export function extendTimeline(timeline: OccupancyTimeline, snapshot: OccupancySnapshot): OccupancyTimeline {
  const base = timeline.session === snapshot.session ? timeline.zones : {};
  const zones: Record<string, TimelineSegment[]> = {};
  for (const zone of snapshot.zones) {
    const segments = base[zone.zoneId] ?? [];
    const last = segments.at(-1);
    if (last && last.status === zone.status) {
      zones[zone.zoneId] = [...segments.slice(0, -1), { ...last, to: snapshot.time }];
    } else {
      zones[zone.zoneId] = [...segments, { status: zone.status, from: last?.to ?? snapshot.time, to: snapshot.time }];
    }
  }
  return { session: snapshot.session, zones };
}
