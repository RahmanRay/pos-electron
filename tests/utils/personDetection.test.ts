import { describe, expect, it } from 'vitest';
import type { CameraZone, PersonDetection } from '@/types';
import { detectionRegions, mapRegionDetection, mergePersonDetections } from '@/utils/personDetection';

const zone = (id: string, x: number, y: number, width: number, height: number): CameraZone => ({
  id,
  label: id,
  polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
});

const person = (x: number, y: number, width: number, height: number, score = 0.8): PersonDetection => ({ x, y, width, height, score });

describe('table detection crops', () => {
  it('starts with the full frame and makes padded squares in source pixels', () => {
    const regions = detectionRegions([zone('rear', 0.3, 0.2, 0.1, 0.2)], 1920, 1080);
    expect(regions[0]).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    const crop = regions[1]!;
    expect(crop.zoneId).toBe('rear');
    expect(crop.width * 1920).toBeCloseTo(216 * 1.3);
    expect(crop.height * 1080).toBeCloseTo(crop.width * 1920);
    expect(crop.x + crop.width / 2).toBeCloseTo(0.35);
    expect(crop.y + crop.height / 2).toBeCloseTo(0.3);
  });

  it('shifts edge crops into view while preserving the square', () => {
    const crop = detectionRegions([zone('edge', 0.9, 0, 0.1, 0.2)], 1920, 1080)[1]!;
    expect(crop.y).toBe(0);
    expect(crop.x + crop.width).toBeCloseTo(1);
    expect(crop.width * 1920).toBeCloseTo(crop.height * 1080);
    expect(crop.x).toBeLessThan(0.9);
    expect(crop.height).toBeGreaterThan(0.2);
  });

  it('uses the whole short dimension when the square cannot fit', () => {
    const crop = detectionRegions([zone('wide', 0.1, 0.25, 0.6, 0.25)], 1920, 1080)[1]!;
    expect(crop.height).toBe(1);
    expect(crop.y).toBe(0);
    expect(crop.width).toBeCloseTo(0.78);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1);
  });

  it('skips duplicate and almost full-frame crops', () => {
    const regions = detectionRegions([
      zone('a', 0.3, 0.2, 0.1, 0.2),
      zone('duplicate', 0.3, 0.2, 0.1, 0.2),
      zone('whole', 0, 0, 1, 1),
    ], 1920, 1080);
    expect(regions).toHaveLength(2);
    expect(regions[1]?.zoneId).toBe('a');
  });

  it('keeps distinct edge zones even when their shifted crop bounds match', () => {
    const regions = detectionRegions([
      zone('left', 0, 0, 0.1, 0.2),
      zone('adjacent', 0.01, 0.01, 0.1, 0.2),
    ], 1920, 1080);
    expect(regions).toHaveLength(3);
    expect(regions[1]?.zoneId).toBe('left');
    expect(regions[2]?.zoneId).toBe('adjacent');
    expect(regions[1]?.x).toBe(regions[2]?.x);
    expect(regions[1]?.y).toBe(regions[2]?.y);
    expect(regions[1]?.width).toBeCloseTo(regions[2]!.width);
    expect(regions[1]?.height).toBeCloseTo(regions[2]!.height);
  });

  it('ignores invalid zones and invalid frame sizes', () => {
    expect(detectionRegions([zone('a', 0.2, 0.2, 0.1, 0.1)], 0, 1080)).toHaveLength(1);
    expect(detectionRegions([
      zone('empty', 0.2, 0.2, 0, 0.1),
      { id: 'invalid', label: 'invalid', polygon: [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
    ], 1920, 1080)).toHaveLength(1);
  });
});

describe('crop detection coordinates', () => {
  it('maps local detections back to normalized frame coordinates', () => {
    const mapped = mapRegionDetection(person(0.2, 0.1, 0.4, 0.5), { x: 0.25, y: 0.2, width: 0.5, height: 0.4 });
    expect(mapped.x).toBeCloseTo(0.35);
    expect(mapped.y).toBeCloseTo(0.24);
    expect(mapped.width).toBeCloseTo(0.2);
    expect(mapped.height).toBeCloseTo(0.2);
    expect(mapped.score).toBe(0.8);
  });

  it('clips predictions that extend past crop and frame boundaries', () => {
    const mapped = mapRegionDetection(person(-0.2, 0.5, 1.5, 0.8), { x: 0.6, y: 0.7, width: 0.5, height: 0.5 });
    expect(mapped.x).toBeCloseTo(0.6);
    expect(mapped.y).toBeCloseTo(0.95);
    expect(mapped.width).toBeCloseTo(0.4);
    expect(mapped.height).toBeCloseTo(0.05);
  });
});

describe('cross-scale person suppression', () => {
  it('keeps the best overlapping detection of the same person', () => {
    const high = person(0.3, 0.2, 0.2, 0.4, 0.9);
    const lower = person(0.31, 0.21, 0.2, 0.4, 0.6);
    const merged = mergePersonDetections([lower, high], 30);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.score).toBe(0.9);
  });

  it('deduplicates nested seated torso and full-body predictions', () => {
    const body = person(0.3, 0.2, 0.2, 0.6, 0.7);
    const torso = person(0.32, 0.22, 0.16, 0.2, 0.9);
    const merged = mergePersonDetections([body, torso], 30);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.score).toBe(0.9);
  });

  it('keeps nested real people whose anchors belong to different tables', () => {
    const front = person(0.2, 0.1, 0.4, 0.7, 0.9);
    const rear = person(0.25, 0.12, 0.15, 0.2, 0.8);
    const zones = [zone('rear', 0.2, 0.1, 0.4, 0.2), zone('front', 0.2, 0.3, 0.4, 0.5)];
    expect(mergePersonDetections([front, rear], 30, zones)).toHaveLength(2);
    // The optional zone context preserves the original suppression API.
    expect(mergePersonDetections([front, rear], 30)).toHaveLength(1);
  });

  it('still deduplicates a nested body and torso assigned to the same table', () => {
    const body = person(0.3, 0.2, 0.2, 0.6, 0.7);
    const torso = person(0.32, 0.22, 0.16, 0.2, 0.9);
    const merged = mergePersonDetections([body, torso], 30, [zone('same', 0.2, 0.1, 0.4, 0.8)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.score).toBe(0.9);
  });

  it('keeps two nearby people with partly overlapping boxes', () => {
    const merged = mergePersonDetections([
      person(0.3, 0.2, 0.2, 0.4, 0.9),
      person(0.44, 0.2, 0.2, 0.4, 0.8),
    ], 30);
    expect(merged).toHaveLength(2);
  });

  it('rejects invalid and out-of-frame boxes and enforces the limit', () => {
    const merged = mergePersonDetections([
      person(0, 0, 0.1, 0.2, 0.7),
      person(0.5, 0, 0.1, 0.2, 0.9),
      person(0, 0, 0, 0.2),
      person(0, 0, -1, 0.2),
      person(NaN, 0, 0.1, 0.2),
      person(0, 0, 0.1, 0.2, Infinity),
      person(1.1, 0, 0.1, 0.2),
    ], 1);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.score).toBe(0.9);
    expect(mergePersonDetections([person(0, 0, 0.1, 0.2)], 0)).toEqual([]);
  });
});
