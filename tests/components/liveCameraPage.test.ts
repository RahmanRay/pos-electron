import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCameraPage } from '@/components/camera/LiveCameraPage';
import { TEXT } from '@/text';
import type { NormalizedPoint } from '@/types';
import type { LiveCameraAPI, LiveCameraSettings } from '@/types/liveCamera';

const stage = vi.hoisted(() => ({ draw: null as ((polygon: NormalizedPoint[]) => void) | null }));

vi.mock('@/hooks/useLiveCamera', () => ({
  useLiveCamera: () => ({ status: { state: 'live' }, hasFrame: true }),
}));
vi.mock('@/components/camera/LiveCameraStage', () => ({
  LiveCameraStage: ({ onZoneDrawn }: { onZoneDrawn: (polygon: NormalizedPoint[]) => void }) => {
    stage.draw = onZoneDrawn;
    return null;
  },
}));
vi.mock('@/components/camera/TableGrid', () => ({ TableGrid: () => null }));
vi.mock('@/components/camera/EventFeed', () => ({ EventFeed: () => null }));
vi.mock('@/components/camera/OccupancyGauge', () => ({ OccupancyGauge: () => null }));

const SETTINGS: LiveCameraSettings = {
  name: 'Restoran', host: '192.168.72.104', port: 554, username: 'admin',
  streamPath: '/ch1/main', rotation: 0, hasPassword: true,
  zones: [{
    id: 'table-7', label: '7',
    polygon: [{ x: 0.125, y: 0.25 }, { x: 0.375, y: 0.25 }, { x: 0.375, y: 0.5 }, { x: 0.125, y: 0.5 }],
  }],
};

let container: HTMLDivElement;
let root: Root;
let api: LiveCameraAPI;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.localStorage.clear();
  stage.draw = null;
  api = {
    getSettings: vi.fn(async () => structuredClone(SETTINGS)),
    saveSettings: vi.fn(async (input) => {
      const { password: _password, ...settings } = input;
      return { ...settings, hasPassword: true };
    }),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    getStatus: vi.fn(async () => ({ state: 'live' as const })),
    onFrame: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
  };
  window.cameraAPI = api;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(createElement(LiveCameraPage)); });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  delete window.cameraAPI;
});

function rotationInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[name="camera-rotate"]');
  if (!input) throw new Error('Rotation setting missing');
  return input;
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
  if (!button) throw new Error(`Button missing: ${text}`);
  return button;
}

function deleteZone(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.getAttribute('aria-label') === TEXT.deleteZone(label));
  if (!button) throw new Error(`Zone removal missing: ${label}`);
  return button;
}

describe('live camera orientation settings', () => {
  it('saves rotated table zones, reconnects once, and keeps their calibration on later saves', async () => {
    expect(rotationInput().checked).toBe(false);
    await act(async () => { rotationInput().click(); });
    await act(async () => { buttonWithText(TEXT.cameraSave).click(); });
    const rotatedZones = [{
      id: 'table-7', label: '7',
      polygon: [{ x: 0.875, y: 0.75 }, { x: 0.625, y: 0.75 }, { x: 0.625, y: 0.5 }, { x: 0.875, y: 0.5 }],
    }];
    expect(api.saveSettings).toHaveBeenNthCalledWith(1, expect.objectContaining({ rotation: 180, zones: rotatedZones }));
    expect(api.connect).toHaveBeenCalledTimes(1);

    await act(async () => { buttonWithText(TEXT.cameraSave).click(); });
    expect(api.saveSettings).toHaveBeenNthCalledWith(2, expect.objectContaining({ rotation: 180, zones: rotatedZones }));
    expect(api.connect).toHaveBeenCalledTimes(1);

    await act(async () => { deleteZone('7').click(); });
    expect(api.saveSettings).toHaveBeenNthCalledWith(3, expect.objectContaining({ rotation: 180, zones: [] }));
    expect(rotationInput().checked).toBe(true);
  });

  it('preserves an unsaved orientation choice while adding and deleting table zones', async () => {
    const polygon = [{ x: 0.5, y: 0.125 }, { x: 0.75, y: 0.125 }, { x: 0.75, y: 0.375 }, { x: 0.5, y: 0.375 }];
    await act(async () => { rotationInput().click(); });
    await act(async () => {
      if (!stage.draw) throw new Error('Zone drawing callback missing');
      stage.draw(polygon);
    });
    const addedZone = { id: '1', label: '1', polygon };
    expect(api.saveSettings).toHaveBeenNthCalledWith(1, expect.objectContaining({ rotation: 0, zones: [...SETTINGS.zones, addedZone] }));
    expect(rotationInput().checked).toBe(true);

    await act(async () => { deleteZone('7').click(); });
    expect(api.saveSettings).toHaveBeenNthCalledWith(2, expect.objectContaining({ rotation: 0, zones: [addedZone] }));
    expect(rotationInput().checked).toBe(true);

    await act(async () => { buttonWithText(TEXT.cameraSave).click(); });
    expect(api.saveSettings).toHaveBeenNthCalledWith(3, expect.objectContaining({
      rotation: 180,
      zones: [{ id: '1', label: '1', polygon: [{ x: 0.5, y: 0.875 }, { x: 0.25, y: 0.875 }, { x: 0.25, y: 0.625 }, { x: 0.5, y: 0.625 }] }],
    }));
    expect(api.connect).toHaveBeenCalledTimes(1);
  });
});
