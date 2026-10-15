import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '@/utils/occupancy';
import { ellipsePolygon, isValidZonePolygon, rectanglePolygon, ZONE_MAX_POINTS } from '@/utils/zoneGeometry';

describe('dragged zone geometry', () => {
  it('makes the same rectangle when the drag is reversed', () => {
    const expected = [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }, { x: 0.8, y: 0.7 }, { x: 0.2, y: 0.7 }];
    expect(rectanglePolygon({ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 })).toEqual(expected);
    expect(rectanglePolygon({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.3 })).toEqual(expected);
    expect(isValidZonePolygon(expected)).toBe(true);
  });

  it('samples an ellipse within the exact drag bounds in either direction', () => {
    const start = { x: 0.1, y: 0.25 };
    const end = { x: 0.9, y: 0.75 };
    const ellipse = ellipsePolygon(start, end);
    expect(ellipsePolygon(end, start)).toEqual(ellipse);
    expect(ellipse).toHaveLength(ZONE_MAX_POINTS);
    expect(Math.min(...ellipse.map((point) => point.x))).toBeCloseTo(start.x);
    expect(Math.max(...ellipse.map((point) => point.x))).toBeCloseTo(end.x);
    expect(Math.min(...ellipse.map((point) => point.y))).toBeCloseTo(start.y);
    expect(Math.max(...ellipse.map((point) => point.y))).toBeCloseTo(end.y);
    for (const point of ellipse) expect(((point.x - 0.5) / 0.4) ** 2 + ((point.y - 0.5) / 0.25) ** 2).toBeCloseTo(1);
    expect(isValidZonePolygon(ellipse)).toBe(true);
  });

  it('uses the round boundary for occupancy rather than its rectangular corners', () => {
    const circle = ellipsePolygon({ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, circle)).toBe(true);
    expect(pointInPolygon({ x: 0.7, y: 0.5 }, circle)).toBe(true);
    expect(pointInPolygon({ x: 0.25, y: 0.25 }, circle)).toBe(false);
    expect(pointInPolygon({ x: 0.1, y: 0.5 }, circle)).toBe(false);
  });

  it('keeps drags at the camera edges within normalized bounds', () => {
    const ellipse = ellipsePolygon({ x: -0.2, y: -0.1 }, { x: 1.2, y: 1.1 });
    expect(ellipse.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true);
    expect(isValidZonePolygon(ellipse)).toBe(true);
  });
});

describe('zone polygon validation', () => {
  it('accepts a concave seating outline in either winding order', () => {
    const concave = [{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.8 }, { x: 0.5, y: 0.4 }, { x: 0.1, y: 0.8 }];
    expect(isValidZonePolygon(concave)).toBe(true);
    expect(isValidZonePolygon([...concave].reverse())).toBe(true);
    expect(pointInPolygon({ x: 0.5, y: 0.2 }, concave)).toBe(true);
    expect(pointInPolygon({ x: 0.5, y: 0.7 }, concave)).toBe(false);
  });

  it('requires usable extent on both axes while preserving the legacy opt-in', () => {
    expect(isValidZonePolygon(rectanglePolygon({ x: 0.2, y: 0.3 }, { x: 0.215, y: 0.315 }))).toBe(true);
    const narrow = rectanglePolygon({ x: 0.2, y: 0.3 }, { x: 0.21, y: 0.5 });
    expect(isValidZonePolygon(narrow)).toBe(false);
    expect(isValidZonePolygon(narrow, 0)).toBe(true);
    expect(isValidZonePolygon(rectanglePolygon({ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.31 }))).toBe(false);
  });

  it('rejects near-collinear outlines below the saved-settings area floor', () => {
    const needle = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.5, y: 0.500001 }];
    expect(isValidZonePolygon(needle)).toBe(false);
    expect(isValidZonePolygon(needle, 0)).toBe(false);
  });

  it('rejects bow-ties and crossings even when their signed area is nonzero', () => {
    expect(isValidZonePolygon([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }, { x: 0.9, y: 0.1 }])).toBe(false);
    expect(isValidZonePolygon([{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.8 }, { x: 0.1, y: 0.9 }, { x: 0.9, y: 0.1 }])).toBe(false);
  });

  it('rejects a non-adjacent edge touching a vertex or overlapping an edge', () => {
    const touching = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.5, y: 0.1 }, { x: 0.1, y: 0.9 }];
    const overlapping = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.3, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.1, y: 0.9 }];
    expect(isValidZonePolygon(touching)).toBe(false);
    expect(isValidZonePolygon(overlapping)).toBe(false);
  });

  it('rejects duplicate vertices and adjacent backtracking edges', () => {
    const rectangle = rectanglePolygon({ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.8 });
    expect(isValidZonePolygon([...rectangle, rectangle[0]!])).toBe(false);
    expect(isValidZonePolygon([rectangle[0]!, rectangle[0]!, rectangle[1]!, rectangle[2]!])).toBe(false);
    expect(isValidZonePolygon([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }, { x: 0.1, y: 0.9 }])).toBe(false);
  });

  it('rejects degenerate, oversized and non-normalized polygons', () => {
    expect(isValidZonePolygon([{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }])).toBe(false);
    expect(isValidZonePolygon([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }])).toBe(false);
    const circle = ellipsePolygon({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 });
    expect(isValidZonePolygon([...circle, { x: 0.5, y: 0.5 }])).toBe(false);
    expect(isValidZonePolygon([{ x: NaN, y: 0 }, { x: 0.8, y: 0 }, { x: 0.8, y: 0.8 }])).toBe(false);
    expect(isValidZonePolygon([{ x: 0, y: 0 }, { x: Infinity, y: 0 }, { x: 0.8, y: 0.8 }])).toBe(false);
    expect(isValidZonePolygon([{ x: -0.1, y: 0 }, { x: 0.8, y: 0 }, { x: 0.8, y: 0.8 }])).toBe(false);
    expect(isValidZonePolygon([{ x: 0, y: 0 }, { x: 1.1, y: 0 }, { x: 0.8, y: 0.8 }])).toBe(false);
  });
});
