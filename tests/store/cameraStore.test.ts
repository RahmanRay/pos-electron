import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraZone, PersonDetection } from '@/types';

const ZONES: CameraZone[] = [{ id: 'table-7', label: '7', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }];
const PERSON: PersonDetection[] = [{ x: 0.3, y: 0.3, width: 0.1, height: 0.2, score: 0.9 }];

async function liveStore() {
  const { useCameraStore } = await import('@/store/cameraStore');
  const store = useCameraStore;
  store.getState().configureLive(ZONES, 'camera-1');
  store.getState().setDetector('ready');
  store.getState().setFeed('live');
  return store;
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
});

describe('live observation clock', () => {
  it('uses real elapsed frame time while freezing the unobserved offline gap', async () => {
    const store = await liveStore();
    for (let i = 0; i <= 12; i++) store.getState().applyLiveFrame(1000 + i * 0.25, PERSON, 20);
    expect(store.getState().snapshot.time).toBe(3);
    expect(store.getState().snapshot.zones[0]?.status).toBe('occupied');
    store.getState().setFeed('stalled');
    store.getState().applyLiveFrame(2000, PERSON, 20);
    expect(store.getState().snapshot.time).toBe(3);
    store.getState().setFeed('live');
    store.getState().applyLiveFrame(2000, PERSON, 20);
    store.getState().applyLiveFrame(2000.25, PERSON, 20);
    expect(store.getState().snapshot.time).toBe(3.25);
  });

  it('restores seating duration after reload and never restores to a different camera', async () => {
    const store = await liveStore();
    for (let i = 0; i <= 12; i++) store.getState().applyLiveFrame(1000 + i * 0.25, PERSON, 20);
    store.getState().setFeed('paused');
    vi.resetModules();
    const reopened = await liveStore();
    expect(reopened.getState().snapshot.time).toBe(3);
    expect(reopened.getState().snapshot.zones[0]).toMatchObject({ status: 'occupied', hidden: true, visitStart: 0 });
    reopened.getState().applyLiveFrame(3000, PERSON, 20);
    reopened.getState().applyLiveFrame(3000.25, PERSON, 20);
    expect(reopened.getState().snapshot.time).toBe(3.25);
    reopened.getState().configureLive(ZONES, 'camera-2');
    expect(reopened.getState().snapshot.time).toBe(0);
    expect(reopened.getState().snapshot.zones[0]?.status).toBe('empty');
  });
});
