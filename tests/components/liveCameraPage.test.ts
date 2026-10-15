import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCameraPage } from '@/components/camera/LiveCameraPage';
import { TEXT } from '@/text';
import type { CameraZone, NormalizedPoint } from '@/types';
import type { LiveCameraAPI, LiveCameraSettings } from '@/types/liveCamera';
import type { ZoneDrawingMode } from '@/utils/zoneGeometry';

interface StageCapture {
  drawingMode: ZoneDrawingMode;
  editingZone: CameraZone | null;
  drawingEnabled: boolean;
  onZoneDrawn: (polygon: NormalizedPoint[]) => void;
  onZoneUpdated: (id: string, polygon: NormalizedPoint[]) => void;
  onCancelDrawing: () => void;
}

const stage = vi.hoisted(() => ({
  draw: null as ((polygon: NormalizedPoint[]) => void) | null,
  props: null as StageCapture | null,
}));

vi.mock('@/hooks/useLiveCamera', () => ({
  useLiveCamera: () => ({ status: { state: 'live' }, hasFrame: true }),
}));
vi.mock('@/components/camera/LiveCameraStage', () => ({
  LiveCameraStage: (props: StageCapture) => {
    stage.draw = props.onZoneDrawn;
    stage.props = props;
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
  stage.props = null;
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

function stageProps(): StageCapture {
  if (!stage.props) throw new Error('Camera stage props missing');
  return stage.props;
}

async function reloadSettings(settings: LiveCameraSettings): Promise<void> {
  vi.mocked(api.getSettings).mockResolvedValue(structuredClone(settings));
  await act(async () => { root.unmount(); });
  root = createRoot(container);
  await act(async () => { root.render(createElement(LiveCameraPage)); });
}

function editZone(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.getAttribute('aria-label') === TEXT.editZone(label));
  if (!button) throw new Error(`Zone editor missing: ${label}`);
  return button;
}

function tableIdInput(): HTMLInputElement {
  const input = Array.from(container.querySelectorAll('input')).find((candidate) => candidate.placeholder === TEXT.tableIdPlaceholder);
  if (!input) throw new Error('Table ID setting missing');
  return input;
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

describe('live table zone editor', () => {
  it('passes the selected ellipse mode to the stage and saves all drawn points with the saved rotation', async () => {
    await reloadSettings({ ...SETTINGS, rotation: 180 });
    expect(stageProps()).toMatchObject({ drawingMode: 'polygon', drawingEnabled: false, editingZone: null });
    const ellipse = container.querySelector<HTMLInputElement>('input[name="zone-shape"][value="ellipse"]');
    if (!ellipse) throw new Error('Ellipse drawing mode missing');
    await act(async () => { ellipse.click(); });
    await act(async () => { buttonWithText(TEXT.drawZone).click(); });
    expect(stageProps()).toMatchObject({ drawingMode: 'ellipse', drawingEnabled: true, editingZone: null });

    const polygon = Array.from({ length: 16 }, (_, index) => ({
      x: 0.5 + 0.25 * Math.cos(index * 2 * Math.PI / 16),
      y: 0.5 + 0.125 * Math.sin(index * 2 * Math.PI / 16),
    }));
    await act(async () => { stageProps().onZoneDrawn(polygon); });
    expect(api.saveSettings).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      rotation: 180,
      zones: [...SETTINGS.zones, { id: '1', label: '1', polygon }],
    }));
    expect(stageProps().drawingEnabled).toBe(false);
    expect(api.connect).not.toHaveBeenCalled();
  });

  it('edits only the selected table geometry and preserves both table identities and rotation', async () => {
    const neighbour: CameraZone = {
      id: 'other', label: 'VIP',
      polygon: [{ x: 0.5, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 0.75, y: 0.75 }, { x: 0.5, y: 0.75 }],
    };
    await reloadSettings({ ...SETTINGS, rotation: 180, zones: [...SETTINGS.zones, neighbour] });
    await act(async () => { editZone('7').click(); });
    expect(stageProps()).toMatchObject({ drawingEnabled: true, drawingMode: 'polygon', editingZone: SETTINGS.zones[0] });
    const polygon = [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.15 }, { x: 0.45, y: 0.5 }, { x: 0.2, y: 0.55 }];
    await act(async () => { stageProps().onZoneUpdated('table-7', polygon); });
    expect(api.saveSettings).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      rotation: 180,
      zones: [{ ...SETTINGS.zones[0], polygon }, neighbour],
    }));
    expect(stageProps()).toMatchObject({ drawingEnabled: false, editingZone: null });
    expect(api.connect).not.toHaveBeenCalled();
  });

  it('cancels drawing and editing without saving camera settings', async () => {
    await act(async () => { buttonWithText(TEXT.drawZone).click(); });
    expect(stageProps().drawingEnabled).toBe(true);
    await act(async () => { stageProps().onCancelDrawing(); });
    expect(stageProps()).toMatchObject({ drawingEnabled: false, editingZone: null });

    await act(async () => { editZone('7').click(); });
    expect(stageProps().editingZone?.id).toBe('table-7');
    await act(async () => { buttonWithText(TEXT.cancelDrawing).click(); });
    expect(stageProps()).toMatchObject({ drawingEnabled: false, editingZone: null });
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it('starts with a free table ID, rejects duplicates before drawing, and skips existing IDs after saving', async () => {
    const zones = ['1', '2', '4'].map((id) => ({ ...SETTINGS.zones[0]!, id, label: id }));
    await reloadSettings({ ...SETTINGS, zones });
    expect(tableIdInput().value).toBe('3');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setValue) throw new Error('Native input setter missing');
    await act(async () => {
      setValue.call(tableIdInput(), '2');
      tableIdInput().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { buttonWithText(TEXT.drawZone).click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(TEXT.cameraDuplicateZone);
    expect(stageProps().drawingEnabled).toBe(false);
    expect(api.saveSettings).not.toHaveBeenCalled();

    await act(async () => {
      setValue.call(tableIdInput(), '3');
      tableIdInput().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { buttonWithText(TEXT.drawZone).click(); });
    expect(stageProps().drawingEnabled).toBe(true);
    const polygon = [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }];
    await act(async () => { stageProps().onZoneDrawn(polygon); });
    expect(api.saveSettings).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ zones: [...zones, { id: '3', label: '3', polygon }] }));
    expect(tableIdInput().value).toBe('5');
  });
});
