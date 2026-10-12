import { describe, expect, it } from 'vitest';
import type { CameraZone, OccupancyTimeline, PersonDetection } from '@/types';
import {
  countPeopleByZone,
  createOccupancyTracker,
  extendTimeline,
  pointInPolygon,
  seatedSeconds,
  type OccupancyOptions,
} from '@/utils/occupancy';

const OPTIONS: OccupancyOptions = {
  seatAfterSec: 1.5,
  seatMinPresence: 0.6,
  passByGapSec: 0.6,
  leaveAfterSec: 2,
  maxEvents: 40,
};

const square = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const ZONES: CameraZone[] = [
  { id: 'a', label: 'A', polygon: square(0, 0, 0.5, 0.5) },
  { id: 'b', label: 'B', polygon: square(0.5, 0, 1, 0.5) },
];

/** A person whose box centre is at (cx, cy). */
const person = (cx: number, cy: number): PersonDetection => ({ x: cx - 0.05, y: cy - 0.1, width: 0.1, height: 0.2, score: 0.8 });
const IN_A = person(0.25, 0.25);
const IN_B = person(0.75, 0.25);

/** Feeds frames every `step` seconds from `from` to `to` (inclusive) with the given detections. */
function feed(tracker: ReturnType<typeof createOccupancyTracker>, from: number, to: number, detections: PersonDetection[], step = 0.25) {
  let snapshot = tracker.snapshot();
  for (let t = from; t <= to + 1e-9; t += step) snapshot = tracker.update(Number(t.toFixed(3)), detections);
  return snapshot;
}

const zone = (snapshot: ReturnType<ReturnType<typeof createOccupancyTracker>['snapshot']>, id: string) => {
  const found = snapshot.zones.find((candidate) => candidate.zoneId === id);
  if (!found) throw new Error(`zone ${id} missing`);
  return found;
};

describe('zone geometry', () => {
  it('tests points against polygons', () => {
    expect(pointInPolygon({ x: 0.25, y: 0.25 }, ZONES[0]!.polygon)).toBe(true);
    expect(pointInPolygon({ x: 0.75, y: 0.25 }, ZONES[0]!.polygon)).toBe(false);
    expect(pointInPolygon({ x: 0.25, y: 0.75 }, ZONES[0]!.polygon)).toBe(false);
  });

  it('counts each person once, in the zone that holds the centre of their box', () => {
    const counts = countPeopleByZone([IN_A, IN_A, IN_B, person(0.5, 0.9)], ZONES);
    expect(Object.fromEntries(counts)).toEqual({ a: 2, b: 1 });
  });
});

describe('occupancy tracker', () => {
  it('marks a table occupied only after someone stayed long enough', () => {
    const tracker = createOccupancyTracker(ZONES, OPTIONS);
    let snapshot = feed(tracker, 0, 1, [IN_A]);
    expect(zone(snapshot, 'a').status).toBe('arriving');
    snapshot = feed(tracker, 1.25, 2, [IN_A]);
    expect(zone(snapshot, 'a').status).toBe('occupied');
    expect(zone(snapshot, 'b').status).toBe('empty');
    expect(seatedSeconds(zone(snapshot, 'a'), 2)).toBe(2);
    expect(snapshot.events.map((event) => event.kind)).toEqual(['seated']);
  });

  it('a person walking through a zone is a pass-by, never an occupied table', () => {
    const tracker = createOccupancyTracker(ZONES, OPTIONS);
    feed(tracker, 0, 0.75, [IN_A]);
    const snapshot = feed(tracker, 1, 2.5, []);
    expect(zone(snapshot, 'a').status).toBe('empty');
    expect(snapshot.events).toEqual([expect.objectContaining({ kind: 'passedBy', zoneId: 'a', duration: 0.75 })]);
  });

  it('seats a person even when the detector misses some frames', () => {
    const tracker = createOccupancyTracker(ZONES, OPTIONS);
    let snapshot = tracker.snapshot();
    // Seen in 2 of every 3 frames.
    for (let i = 0; i <= 10; i++) snapshot = tracker.update(i * 0.25, i % 3 === 2 ? [] : [IN_A]);
    expect(zone(snapshot, 'a').status).toBe('occupied');
  });

  it('keeps an occupied table (and its timer) through a short occlusion', () => {
    const tracker = createOccupancyTracker(ZONES, OPTIONS);
    feed(tracker, 0, 3, [IN_A]);
    let snapshot = feed(tracker, 3.25, 4.5, []);
    expect(zone(snapshot, 'a')).toMatchObject({ status: 'occupied', hidden: true, visitStart: 0 });
    expect(seatedSeconds(zone(snapshot, 'a'), snapshot.time)).toBe(4.5);
    snapshot = feed(tracker, 4.75, 5, [IN_A]);
    expect(zone(snapshot, 'a')).toMatchObject({ status: 'occupied', hidden: false, visitStart: 0 });
    expect(snapshot.events.map((event) => event.kind)).toEqual(['seated']);
  });

  it('frees the table when nobody is seen for leaveAfterSec and records the stay', () => {
    const tracker = createOccupancyTracker(ZONES, OPTIONS);
    feed(tracker, 0, 3, [IN_A]);
    const snapshot = feed(tracker, 3.25, 5, []);
    expect(zone(snapshot, 'a').status).toBe('empty');
    expect(snapshot.events.at(-1)).toMatchObject({ kind: 'left', zoneId: 'a', at: 5, duration: 3 });
  });

  it('starts a new, empty session when the video loops', () => {
    const tracker = createOccupancyTracker(ZONES, OPTIONS);
    let snapshot = feed(tracker, 0, 3, [IN_A, IN_B]);
    expect(snapshot.session).toBe(1);
    expect(snapshot.events).toHaveLength(2);
    snapshot = tracker.update(0.1, []);
    expect(snapshot.session).toBe(2);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.zones.every((candidate) => candidate.status === 'empty' && candidate.visitStart === null)).toBe(true);
  });

  it('ignores repeated or slightly older frames instead of restarting', () => {
    const tracker = createOccupancyTracker(ZONES, OPTIONS);
    feed(tracker, 0, 2, [IN_A]);
    const snapshot = tracker.update(1.9, []);
    expect(snapshot.session).toBe(1);
    expect(zone(snapshot, 'a').status).toBe('occupied');
  });

  it('restores a measured visit without treating time while closed as a new observation', () => {
    const initial = createOccupancyTracker(ZONES, OPTIONS);
    const before = feed(initial, 0, 5, [IN_A]);
    const restored = createOccupancyTracker(ZONES, OPTIONS, before);
    expect(zone(restored.snapshot(), 'a')).toMatchObject({ status: 'occupied', hidden: true, people: 0 });
    const after = restored.update(5.25, [IN_A]);
    expect(seatedSeconds(zone(after, 'a'), after.time)).toBe(5.25);
    expect(after.events.filter((event) => event.kind === 'seated')).toHaveLength(1);
  });

  it('requires a fresh sustained arrival after restoring a pending visit', () => {
    const initial = createOccupancyTracker(ZONES, OPTIONS);
    const pending = feed(initial, 0, 1, [IN_A]);
    const restored = createOccupancyTracker(ZONES, OPTIONS, pending);
    expect(zone(restored.snapshot(), 'a').status).toBe('empty');
    expect(zone(restored.update(1.25, [IN_A]), 'a').status).toBe('arriving');
  });

  it('keeps only the newest events', () => {
    const tracker = createOccupancyTracker(ZONES, { ...OPTIONS, maxEvents: 3 });
    let t = 0;
    for (let visit = 0; visit < 5; visit++) {
      tracker.update((t += 0.25), [IN_A]);
      for (let i = 0; i < 4; i++) tracker.update((t += 0.25), []);
    }
    const { events } = tracker.snapshot();
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.id)).toEqual([3, 4, 5]);
  });
});

describe('occupancy timeline', () => {
  it('merges unchanged stretches and starts over on a new session', () => {
    const tracker = createOccupancyTracker(ZONES, OPTIONS);
    let timeline: OccupancyTimeline = { session: 0, zones: {} };
    for (let i = 0; i <= 8; i++) timeline = extendTimeline(timeline, tracker.update(i * 0.25, [IN_A]));
    expect(timeline.zones.a).toEqual([
      { status: 'arriving', from: 0, to: 1.25 },
      { status: 'occupied', from: 1.25, to: 2 },
    ]);
    expect(timeline.zones.b).toEqual([{ status: 'empty', from: 0, to: 2 }]);

    timeline = extendTimeline(timeline, tracker.update(0.1, []));
    expect(timeline.session).toBe(2);
    expect(timeline.zones.a).toEqual([{ status: 'empty', from: 0.1, to: 0.1 }]);
  });
});
