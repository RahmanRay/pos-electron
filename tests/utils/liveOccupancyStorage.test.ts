import { describe, expect, it } from 'vitest';
import { boundedLiveTimeline, liveOccupancySignature, parseLiveOccupancy, type SavedLiveOccupancy } from '@/services/liveOccupancyStorage';
import type { CameraZone } from '@/types';

const ZONES: CameraZone[] = [{ id: 'table-7', label: '7', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }];
const signature = liveOccupancySignature(ZONES, '192.168.72.104:554/h264/ch1/main/av_stream');

function saved(): SavedLiveOccupancy {
  return {
    version: 1, signature,
    snapshot: { session: 1, time: 30, zones: [{ zoneId: 'table-7', status: 'occupied', people: 1, visitStart: 5, lastSeen: 30, hidden: false }], events: [{ id: 1, kind: 'seated', zoneId: 'table-7', at: 7, session: 1 }] },
    timeline: { session: 1, zones: { 'table-7': [{ status: 'occupied', from: 7, to: 30 }] } },
  };
}

describe('live occupancy restoration', () => {
  it('restores only the same camera and exact zone calibration', () => {
    const raw = JSON.stringify(saved());
    expect(parseLiveOccupancy(raw, signature, ZONES)?.snapshot.zones[0]?.visitStart).toBe(5);
    expect(parseLiveOccupancy(raw, liveOccupancySignature(ZONES, 'another-camera'), ZONES)).toBeNull();
    expect(parseLiveOccupancy(raw, liveOccupancySignature([{ ...ZONES[0]!, label: '8' }], '192.168.72.104:554/h264/ch1/main/av_stream'), ZONES)).toBeNull();
  });

  it('rejects corrupt visits and timeline data', () => {
    const invalid = saved();
    invalid.snapshot.zones[0]!.visitStart = 31;
    expect(parseLiveOccupancy(JSON.stringify(invalid), signature, ZONES)).toBeNull();
    const invalidTimeline = saved();
    invalidTimeline.timeline.zones['table-7']![0]!.to = 31;
    expect(parseLiveOccupancy(JSON.stringify(invalidTimeline), signature, ZONES)).toBeNull();
    expect(parseLiveOccupancy('{', signature, ZONES)).toBeNull();
  });

  it('bounds long-running live history', () => {
    const result = boundedLiveTimeline({ session: 1, zones: { 'table-7': Array.from({ length: 1000 }, (_, i) => ({ status: 'occupied', from: i, to: i + 1 })) } });
    expect(result.zones['table-7']).toHaveLength(256);
    expect(result.zones['table-7']?.at(-1)?.to).toBe(1000);
  });
});
