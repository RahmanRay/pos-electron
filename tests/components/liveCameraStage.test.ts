import { act, createElement, createRef, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCameraStage } from '@/components/camera/LiveCameraStage';
import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import type { CameraZone } from '@/types';

let container: HTMLDivElement;
let root: Root;
let props: ComponentProps<typeof LiveCameraStage>;

const existing: CameraZone = {
  id: 'table-3', label: '3',
  polygon: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.7 }, { x: 0.2, y: 0.7 }],
};

async function render(update: Partial<typeof props> = {}) {
  props = { ...props, ...update };
  await act(async () => { root.render(createElement(LiveCameraStage, props)); });
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useCameraStore.setState({ zones: [], detections: [], detector: 'ready' });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, toJSON: () => ({}),
  });
  props = {
    canvasRef: createRef<HTMLCanvasElement>(), name: 'Kamera', status: { state: 'live' }, hasFrame: true,
    drawingEnabled: true, drawingMode: 'polygon', editingZone: null,
    onZoneDrawn: vi.fn(), onZoneUpdated: vi.fn(), onCancelDrawing: vi.fn(),
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

function surface(): SVGSVGElement {
  const result = container.querySelector<SVGSVGElement>('[data-testid="zone-drawing-surface"]');
  if (!result) throw new Error('Drawing surface missing');
  return result;
}

function editor(): HTMLDivElement {
  const result = container.querySelector<HTMLDivElement>('[data-testid="zone-editor"]');
  if (!result) throw new Error('Editor missing');
  return result;
}

function vertex(index: number): SVGGElement {
  const result = container.querySelector<SVGGElement>(`[data-point-index="${index}"]`);
  if (!result) throw new Error(`Point ${index} missing`);
  return result;
}

function button(label: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === label);
  if (!result) throw new Error(`Button ${label} missing`);
  return result;
}

async function pointer(type: string, x: number, y: number, target: Element = surface()) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x * 1000, clientY: y * 500 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
  await act(async () => { target.dispatchEvent(event); });
}

async function point(x: number, y: number) {
  await pointer('pointerdown', x, y);
  await pointer('pointerup', x, y);
}

async function key(value: string) {
  await act(async () => { editor().dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); });
}

async function click(label: string) {
  await act(async () => { button(label).click(); });
}

async function triangle() {
  await point(0.2, 0.2);
  await point(0.8, 0.2);
  await point(0.5, 0.7);
}

describe('camera table zone editor', () => {
  it('closes a polygon at its first point without appending a duplicate vertex', async () => {
    await triangle();
    expect(props.onZoneDrawn).not.toHaveBeenCalled();

    await pointer('pointerdown', 0.2, 0.2, vertex(0));
    await pointer('pointerup', 0.2, 0.2);

    expect(props.onZoneDrawn).toHaveBeenCalledExactlyOnceWith([
      { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.7 },
    ]);
    expect(props.onZoneUpdated).not.toHaveBeenCalled();
  });

  it.each(['button', 'Enter'])('commits a polygon only after explicit %s confirmation', async (method) => {
    await triangle();
    expect(props.onZoneDrawn).not.toHaveBeenCalled();

    if (method === 'button') await click(TEXT.finishZone);
    else await key('Enter');

    expect(props.onZoneDrawn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onZoneDrawn).mock.calls[0]?.[0]).toHaveLength(3);
  });

  it('undoes individual points and cancels by button or Escape without saving', async () => {
    await triangle();
    await click(TEXT.undoPoint);
    expect(container.querySelectorAll('[data-point-index]')).toHaveLength(2);
    await key('Backspace');
    expect(container.querySelectorAll('[data-point-index]')).toHaveLength(1);

    await click(TEXT.cancelDrawing);
    await key('Escape');

    expect(props.onCancelDrawing).toHaveBeenCalledTimes(2);
    expect(props.onZoneDrawn).not.toHaveBeenCalled();
    expect(props.onZoneUpdated).not.toHaveBeenCalled();
  });

  it('makes a sixteen-point ellipse with the dragged bounds and waits for confirmation', async () => {
    await render({ drawingMode: 'ellipse' });
    await pointer('pointerdown', 0.2, 0.2);
    await pointer('pointermove', 0.8, 0.7);
    await pointer('pointerup', 0.8, 0.7);
    expect(container.querySelectorAll('[data-point-index]')).toHaveLength(16);
    expect(props.onZoneDrawn).not.toHaveBeenCalled();

    await click(TEXT.finishZone);

    const polygon = vi.mocked(props.onZoneDrawn).mock.calls[0]![0];
    expect(polygon).toHaveLength(16);
    expect(Math.min(...polygon.map((candidate) => candidate.x))).toBeCloseTo(0.2);
    expect(Math.max(...polygon.map((candidate) => candidate.x))).toBeCloseTo(0.8);
    expect(Math.min(...polygon.map((candidate) => candidate.y))).toBeCloseTo(0.2);
    expect(Math.max(...polygon.map((candidate) => candidate.y))).toBeCloseTo(0.7);
  });

  it('edits an existing vertex in a draft and saves the same zone only when confirmed', async () => {
    await act(async () => { useCameraStore.setState({ zones: [existing] }); });
    await render({ editingZone: existing });
    expect(container.querySelector(`svg[aria-label="${TEXT.zoneEditor}"] polygon`)).toBeNull();

    await pointer('pointerdown', 0.2, 0.2, vertex(0));
    await pointer('pointermove', 0.1, 0.1);
    await pointer('pointerup', 0.1, 0.1);
    expect(props.onZoneUpdated).not.toHaveBeenCalled();
    expect(existing.polygon[0]).toEqual({ x: 0.2, y: 0.2 });

    await click(TEXT.finishZone);

    expect(props.onZoneUpdated).toHaveBeenCalledTimes(1);
    const [zoneId, polygon] = vi.mocked(props.onZoneUpdated).mock.calls[0]!;
    expect(zoneId).toBe('table-3');
    expect(polygon[0]?.x).toBeCloseTo(0.1);
    expect(polygon[0]?.y).toBeCloseTo(0.1);
    expect(polygon.slice(1)).toEqual(existing.polygon.slice(1));
    expect(props.onZoneDrawn).not.toHaveBeenCalled();
  });

  it('blocks a self-crossing polygon and keeps the draft available for correction', async () => {
    await point(0.2, 0.2);
    await point(0.8, 0.8);
    await point(0.8, 0.2);
    await point(0.2, 0.8);

    await click(TEXT.finishZone);
    await key('Enter');

    expect(props.onZoneDrawn).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(TEXT.invalidZone);
    expect(container.querySelectorAll('[data-point-index]')).toHaveLength(4);
  });

  it('caps free polygons at sixteen points and reports the limit', async () => {
    for (let index = 0; index < 16; index++) {
      const angle = index * 2 * Math.PI / 16;
      await point(0.5 + 0.3 * Math.cos(angle), 0.5 + 0.3 * Math.sin(angle));
    }
    await point(0.5, 0.5);

    expect(container.querySelectorAll('[data-point-index]')).toHaveLength(16);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(TEXT.pointLimit);
    expect(props.onZoneDrawn).not.toHaveBeenCalled();
  });

  it('clamps a reversed rectangle drag to the image and saves only after confirmation', async () => {
    await render({ drawingMode: 'rectangle' });
    await pointer('pointerdown', 0.8, 0.8);
    await pointer('pointermove', -0.1, 0.1);
    await pointer('pointerup', -0.1, 0.1);
    expect(props.onZoneDrawn).not.toHaveBeenCalled();

    await click(TEXT.finishZone);

    expect(props.onZoneDrawn).toHaveBeenCalledExactlyOnceWith([
      { x: 0, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.8 }, { x: 0, y: 0.8 },
    ]);
  });

  it('restores the draft after a cancelled pointer drag without saving', async () => {
    await render({ editingZone: existing });
    await pointer('pointerdown', 0.2, 0.2, vertex(0));
    await pointer('pointermove', 0.1, 0.1);
    await pointer('pointercancel', 0.1, 0.1);
    await click(TEXT.finishZone);

    expect(props.onZoneUpdated).toHaveBeenCalledExactlyOnceWith(existing.id, existing.polygon);
    expect(props.onZoneDrawn).not.toHaveBeenCalled();
  });

  it('resets drafts when disabled or offline and preserves the live canvas across editor sessions', async () => {
    const canvas = props.canvasRef.current;
    await triangle();
    await render({ drawingEnabled: false });
    expect(container.querySelector('[data-testid="zone-editor"]')).toBeNull();
    expect(props.canvasRef.current).toBe(canvas);

    await render({ drawingEnabled: true, drawingMode: 'rectangle' });
    expect(container.querySelectorAll('[data-point-index]')).toHaveLength(0);
    expect(props.canvasRef.current).toBe(canvas);
    await pointer('pointerdown', 0.1, 0.1);
    await pointer('pointerup', 0.6, 0.8);
    expect(props.onZoneDrawn).not.toHaveBeenCalled();

    await render({ status: { state: 'offline' } });
    expect(container.querySelector('[data-testid="zone-editor"]')).toBeNull();
    expect(props.canvasRef.current).toBe(canvas);
    expect(props.onZoneDrawn).not.toHaveBeenCalled();
  });
});
