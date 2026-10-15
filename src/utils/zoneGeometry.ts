import type { NormalizedPoint } from '../types/camera';

export type ZoneDrawingMode = 'rectangle' | 'ellipse' | 'polygon';
export const ZONE_MAX_POINTS = 16;

const EPSILON = 1e-10;
const MIN_DOUBLE_AREA = 0.00001;
const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/** A drag defines the same normalized bounds in either direction. */
export function rectanglePolygon(start: NormalizedPoint, end: NormalizedPoint): NormalizedPoint[] {
  const left = clamp(Math.min(start.x, end.x));
  const right = clamp(Math.max(start.x, end.x));
  const top = clamp(Math.min(start.y, end.y));
  const bottom = clamp(Math.max(start.y, end.y));
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
}

/** The ellipse is stored as a polygon, so drawing and occupancy share its shape. */
export function ellipsePolygon(start: NormalizedPoint, end: NormalizedPoint): NormalizedPoint[] {
  const bounds = rectanglePolygon(start, end);
  const left = bounds[0]!.x;
  const top = bounds[0]!.y;
  const right = bounds[2]!.x;
  const bottom = bounds[2]!.y;
  const rx = (right - left) / 2;
  const ry = (bottom - top) / 2;
  const cx = left + rx;
  const cy = top + ry;
  return Array.from({ length: ZONE_MAX_POINTS }, (_, index) => {
    const angle = (index * 2 * Math.PI) / ZONE_MAX_POINTS;
    return { x: clamp(cx + rx * Math.cos(angle)), y: clamp(cy + ry * Math.sin(angle)) };
  });
}

const cross = (a: NormalizedPoint, b: NormalizedPoint, c: NormalizedPoint): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function onSegment(a: NormalizedPoint, b: NormalizedPoint, point: NormalizedPoint): boolean {
  return point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON;
}

function segmentsIntersect(a: NormalizedPoint, b: NormalizedPoint, c: NormalizedPoint, d: NormalizedPoint): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
      ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return (Math.abs(abC) <= EPSILON && onSegment(a, b, c)) ||
    (Math.abs(abD) <= EPSILON && onSegment(a, b, d)) ||
    (Math.abs(cdA) <= EPSILON && onSegment(c, d, a)) ||
    (Math.abs(cdB) <= EPSILON && onSegment(c, d, b));
}

/**
 * Accept simple seating polygons, including concave outlines. Legacy settings
 * may pass a smaller minimum extent without weakening topology validation.
 */
export function isValidZonePolygon(points: readonly NormalizedPoint[], minExtent = 0.015): boolean {
  if (points.length < 3 || points.length > ZONE_MAX_POINTS || !Number.isFinite(minExtent) || minExtent < 0) return false;
  if (points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
    point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return false;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  if (Math.max(...xs) - Math.min(...xs) + EPSILON < minExtent || Math.max(...ys) - Math.min(...ys) + EPSILON < minExtent) return false;

  let doubleArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    doubleArea += a.x * b.y - a.y * b.x;
    for (let j = i + 1; j < points.length; j++) {
      const other = points[j]!;
      if (Math.abs(a.x - other.x) <= EPSILON && Math.abs(a.y - other.y) <= EPSILON) return false;
    }

    // Adjacent edges may share their endpoint, but cannot double back over
    // each other along the same line.
    const previous = points[(i + points.length - 1) % points.length]!;
    if (Math.abs(cross(previous, a, b)) <= EPSILON &&
      (previous.x - a.x) * (b.x - a.x) + (previous.y - a.y) * (b.y - a.y) > EPSILON) return false;

    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (segmentsIntersect(a, b, points[j]!, points[(j + 1) % points.length]!)) return false;
    }
  }
  return Math.abs(doubleArea) >= MIN_DOUBLE_AREA;
}
