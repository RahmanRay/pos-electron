import type { CameraZone, PersonDetection } from '@/types';
import { detectionAnchor, pointInPolygon } from '@/utils/occupancy';

/** A crop in normalized coordinates of the original camera frame. */
export interface DetectionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  zoneId?: string;
}

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

/**
 * SSD sees a 300px image internally. Table crops make distant seated people
 * larger at that input size; extra space keeps heads and shoulders in view.
 */
export function detectionRegions(
  zones: readonly CameraZone[],
  frameWidth: number,
  frameHeight: number,
): DetectionRegion[] {
  const regions: DetectionRegion[] = [{ x: 0, y: 0, width: 1, height: 1 }];
  const croppedZones: CameraZone[] = [];
  if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) || frameWidth <= 0 || frameHeight <= 0) return regions;

  for (const zone of zones) {
    if (zone.polygon.length < 3 || zone.polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
    const xs = zone.polygon.map((point) => clamp(point.x) * frameWidth);
    const ys = zone.polygon.map((point) => clamp(point.y) * frameHeight);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    if (right <= left || bottom <= top) continue;

    const side = 1.3 * Math.max(right - left, bottom - top);
    const width = Math.min(side, frameWidth);
    const height = Math.min(side, frameHeight);
    // Shift at the image edges instead of cutting away the padded square.
    const region: DetectionRegion = {
      x: clamp((left + right - width) / 2, 0, frameWidth - width) / frameWidth,
      y: clamp((top + bottom - height) / 2, 0, frameHeight - height) / frameHeight,
      width: width / frameWidth,
      height: height / frameHeight,
      zoneId: zone.id,
    };
    if (region.width * region.height >= 0.9) continue;
    // Different seating polygons can produce the same shifted crop at an
    // image edge. Keep those passes: each is filtered by its own table zone.
    if (croppedZones.some((existing) => existing.polygon.length === zone.polygon.length &&
      existing.polygon.every((point, index) => {
        const other = zone.polygon[index]!;
        return Math.abs(point.x - other.x) < 1e-6 && Math.abs(point.y - other.y) < 1e-6;
      }),
    )) continue;
    regions.push(region);
    croppedZones.push(zone);
  }
  return regions;
}

/** Map a crop-local box back to the original frame, clipping crop overflow. */
export function mapRegionDetection(local: PersonDetection, region: DetectionRegion): PersonDetection {
  const x = clamp(region.x + clamp(local.x) * region.width);
  const y = clamp(region.y + clamp(local.y) * region.height);
  const right = clamp(region.x + clamp(local.x + Math.max(0, local.width)) * region.width);
  const bottom = clamp(region.y + clamp(local.y + Math.max(0, local.height)) * region.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y), score: local.score };
}

function validDetection(person: PersonDetection): boolean {
  return [person.x, person.y, person.width, person.height, person.score].every(Number.isFinite) &&
    person.width > 0 && person.height > 0 && person.score >= 0 && person.score <= 1;
}

/** Merge full-frame and crop detections without counting the same person twice. */
export function mergePersonDetections(
  people: readonly PersonDetection[],
  maxDetections: number,
  zones: readonly CameraZone[] = [],
): PersonDetection[] {
  if (!Number.isFinite(maxDetections) || maxDetections < 1) return [];
  const limit = Math.floor(maxDetections);
  const candidates = people.filter(validDetection)
    .map((person) => mapRegionDetection(person, { x: 0, y: 0, width: 1, height: 1 }))
    .filter(validDetection)
    .sort((a, b) => b.score - a.score);
  const kept: PersonDetection[] = [];
  const assignedZone = (person: PersonDetection) => zones.find((zone) => pointInPolygon(detectionAnchor(person), zone.polygon))?.id;
  for (const candidate of candidates) {
    const candidateZone = assignedZone(candidate);
    const duplicate = kept.some((person) => {
      const otherZone = assignedZone(person);
      // Perspective can place a rear guest's small box inside a nearer guest's
      // full-body box. Different table assignments remain separate people.
      if (candidateZone !== undefined && otherZone !== undefined && candidateZone !== otherZone) return false;
      const width = Math.max(0, Math.min(candidate.x + candidate.width, person.x + person.width) - Math.max(candidate.x, person.x));
      const height = Math.max(0, Math.min(candidate.y + candidate.height, person.y + person.height) - Math.max(candidate.y, person.y));
      const intersection = width * height;
      const area = candidate.width * candidate.height;
      const otherArea = person.width * person.height;
      return intersection / (area + otherArea - intersection) >= 0.4 || intersection / Math.min(area, otherArea) >= 0.8;
    });
    if (!duplicate) kept.push(candidate);
    if (kept.length >= limit) break;
  }
  return kept;
}
