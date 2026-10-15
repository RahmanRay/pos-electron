import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { Camera, ScanSearch, TriangleAlert } from 'lucide-react';
import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import type { CameraZone, NormalizedPoint } from '@/types';
import type { LiveCameraStatus } from '@/types/liveCamera';
import { formatStopwatch } from '@/utils/format';
import { seatedSeconds } from '@/utils/occupancy';
import { ellipsePolygon, isValidZonePolygon, rectanglePolygon, ZONE_MAX_POINTS, type ZoneDrawingMode } from '@/utils/zoneGeometry';
import { FRAME_HEIGHT, FRAME_WIDTH, STATUS_STYLES } from './visuals';

interface LiveCameraStageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  name: string;
  status: LiveCameraStatus;
  hasFrame: boolean;
  drawingEnabled: boolean;
  drawingMode: ZoneDrawingMode;
  editingZone: CameraZone | null;
  onZoneDrawn: (polygon: NormalizedPoint[]) => void;
  onZoneUpdated: (zoneId: string, polygon: NormalizedPoint[]) => void;
  onCancelDrawing: () => void;
}

function pointerPoint(event: PointerEvent<SVGSVGElement>): NormalizedPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
  };
}

type EditorDrag = {
  pointerId: number;
  start: NormalizedPoint;
  original: NormalizedPoint[];
} & (
  | { kind: 'shape' }
  | { kind: 'point' }
  | { kind: 'vertex'; index: number; clientX: number; clientY: number; moved: boolean; closeOnClick: boolean }
);

const svgPoints = (points: readonly NormalizedPoint[]) => points.map((point) => `${point.x * FRAME_WIDTH},${point.y * FRAME_HEIGHT}`).join(' ');
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** A new session resets only the editor, preserving the live canvas and its frame loop. */
function ZoneEditor({ drawingMode, editingZone, onZoneDrawn, onZoneUpdated, onCancelDrawing }: Pick<LiveCameraStageProps,
  'drawingMode' | 'editingZone' | 'onZoneDrawn' | 'onZoneUpdated' | 'onCancelDrawing'>) {
  const editorRef = useRef<HTMLDivElement>(null);
  const drag = useRef<EditorDrag | null>(null);
  const [points, setPoints] = useState<NormalizedPoint[]>(() => editingZone?.polygon.map((point) => ({ ...point })) ?? []);
  const [hover, setHover] = useState<NormalizedPoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const [shapeReady, setShapeReady] = useState(Boolean(editingZone));
  const [error, setError] = useState<'invalid' | 'limit' | null>(null);
  const polygonDrawing = !editingZone && drawingMode === 'polygon';

  useEffect(() => { editorRef.current?.focus({ preventScroll: true }); }, []);

  const finish = (draft = points) => {
    if (drag.current) return;
    if (!isValidZonePolygon(draft)) {
      setError('invalid');
      return;
    }
    const polygon = draft.map((point) => ({ ...point }));
    if (editingZone) onZoneUpdated(editingZone.id, polygon);
    else onZoneDrawn(polygon);
  };

  const undo = () => {
    if (drag.current) return;
    setPoints((current) => current.slice(0, -1));
    setError(null);
  };

  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelDrawing();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      undo();
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      finish();
    }
  };

  const shape = (start: NormalizedPoint, end: NormalizedPoint) => drawingMode === 'ellipse' ? ellipsePolygon(start, end) : rectanglePolygon(start, end);

  const moveVertex = (active: Extract<EditorDrag, { kind: 'vertex' }>, point: NormalizedPoint) => active.original.map((original, index) => index === active.index
    ? { x: clamp(original.x + point.x - active.start.x), y: clamp(original.y + point.y - active.start.y) }
    : { ...original });

  const startPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    editorRef.current?.focus({ preventScroll: true });
    const point = pointerPoint(event);
    const vertex = (event.target as Element).closest('[data-point-index]');
    const index = vertex ? Number(vertex.getAttribute('data-point-index')) : -1;
    const original = points.map((candidate) => ({ ...candidate }));
    if (index >= 0 && index < points.length) {
      drag.current = {
        kind: 'vertex', pointerId: event.pointerId, start: point, original, index,
        clientX: event.clientX, clientY: event.clientY, moved: false,
        closeOnClick: polygonDrawing && index === 0 && points.length >= 3,
      };
    } else if (!editingZone) {
      drag.current = { kind: polygonDrawing ? 'point' : 'shape', pointerId: event.pointerId, start: point, original };
      if (!polygonDrawing) {
        setPoints(shape(point, point));
        setShapeReady(false);
      }
    } else return;
    setError(null);
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePointer = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointerPoint(event);
    setHover(point);
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.kind === 'shape') setPoints(shape(active.start, point));
    if (active.kind === 'vertex') {
      active.moved ||= Math.hypot(event.clientX - active.clientX, event.clientY - active.clientY) > 4;
      if (active.moved) setPoints(moveVertex(active, point));
    }
  };

  const endPointer = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = pointerPoint(event);
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.kind === 'shape') {
      setPoints(shape(active.start, point));
      setShapeReady(true);
    } else if (active.kind === 'point') {
      if (points.length >= ZONE_MAX_POINTS) setError('limit');
      else setPoints((current) => [...current, point]);
    } else {
      active.moved ||= Math.hypot(event.clientX - active.clientX, event.clientY - active.clientY) > 4;
      if (active.moved) setPoints(moveVertex(active, point));
      else if (active.closeOnClick) finish(active.original);
    }
  };

  const cancelPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    setPoints(drag.current.original);
    drag.current = null;
    setDragging(false);
    setHover(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div ref={editorRef} tabIndex={0} onKeyDown={keyboard} className="relative outline-none" role="group" aria-label={TEXT.drawZoneLabel} data-testid="zone-editor">
      <div className="absolute inset-x-0 bottom-full aspect-video">
      <svg
        viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`} preserveAspectRatio="none"
        className="absolute inset-0 size-full cursor-crosshair touch-none"
        data-testid="zone-drawing-surface"
        onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancelPointer}
        onPointerLeave={() => { if (!drag.current) setHover(null); }}
      >
        {points.length >= 3 && <polygon points={svgPoints(points)} className="fill-accent/20 stroke-accent" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="6 4" data-testid="zone-draft" />}
        {polygonDrawing && points.length > 0 && <polyline points={svgPoints(hover ? [...points, hover] : points)} className="fill-none stroke-accent" strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        {points.map((point, index) => (
          <g key={index} data-point-index={index} role="button" tabIndex={0} aria-label={TEXT.zonePoint(index + 1)} className="cursor-grab focus:outline-none" onKeyDown={(event) => {
            const delta = { ArrowLeft: [-0.005, 0], ArrowRight: [0.005, 0], ArrowUp: [0, -0.005], ArrowDown: [0, 0.005] }[event.key];
            if (!delta) return;
            event.preventDefault();
            setError(null);
            setPoints((current) => current.map((candidate, position) => position === index ? { x: clamp(candidate.x + delta[0]!), y: clamp(candidate.y + delta[1]!) } : candidate));
          }}>
            <circle cx={point.x * FRAME_WIDTH} cy={point.y * FRAME_HEIGHT} r="8" className="fill-accent stroke-transparent" strokeWidth="24" vectorEffect="non-scaling-stroke" />
            <circle cx={point.x * FRAME_WIDTH} cy={point.y * FRAME_HEIGHT} r="6" className="fill-accent stroke-surface" strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          </g>
        ))}
      </svg>
      </div>
      <div className="rounded-b-2xl border-t border-border bg-surface p-2 text-xs text-fg sm:p-3 sm:text-sm">
        {editingZone && <p className="font-semibold">{TEXT.editingZone(editingZone.label)}</p>}
        <p className="text-fg-muted">{editingZone || shapeReady ? TEXT.adjustZoneHint : TEXT.drawingHints[drawingMode]}</p>
        {error && <p role="alert" className="mt-1 font-medium text-warning">{error === 'limit' ? TEXT.pointLimit : TEXT.invalidZone}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="mr-auto tabular-nums text-fg-muted" aria-live="polite">{TEXT.pointCount(points.length)}</span>
          <button type="button" className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-medium disabled:opacity-40" onClick={undo} disabled={!points.length || dragging}>{TEXT.undoPoint}</button>
          <button type="button" className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-medium" onClick={onCancelDrawing}>{TEXT.cancelDrawing}</button>
          <button type="button" className="rounded-lg bg-accent px-3 py-2 font-semibold text-accent-fg disabled:opacity-40" onClick={() => finish()} disabled={dragging}>{TEXT.finishZone}</button>
        </div>
      </div>
    </div>
  );
}

/** Live image and user-defined table areas share the same normalized coordinates. */
export function LiveCameraStage({ canvasRef, name, status, hasFrame, drawingEnabled, drawingMode, editingZone, onZoneDrawn, onZoneUpdated, onCancelDrawing }: LiveCameraStageProps) {
  const zones = useCameraStore((state) => state.zones);
  const snapshot = useCameraStore((state) => state.snapshot);
  const detections = useCameraStore((state) => state.detections);
  const detector = useCameraStore((state) => state.detector);
  const reliable = status.state === 'live' && detector === 'ready';
  const editorActive = drawingEnabled && hasFrame && status.state === 'live';

  const drawZone = (zone: CameraZone) => {
    if (editorActive && editingZone?.id === zone.id) return null;
    const state = snapshot.zones.find((candidate) => candidate.zoneId === zone.id);
    const style = STATUS_STYLES[state?.status ?? 'empty'];
    const labelX = Math.min(...zone.polygon.map((point) => point.x));
    const labelY = Math.min(...zone.polygon.map((point) => point.y));
    const seconds = state ? seatedSeconds(state, snapshot.time) : null;
    return (
      <g key={zone.id} opacity={reliable ? 1 : 0.45}>
        <polygon
          points={zone.polygon.map((point) => `${point.x * FRAME_WIDTH},${point.y * FRAME_HEIGHT}`).join(' ')}
          className={`${style.fill} ${style.stroke}`}
          fillOpacity="0.12"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeDasharray={reliable ? undefined : '8 6'}
        />
        <text x={labelX * FRAME_WIDTH + 9} y={labelY * FRAME_HEIGHT + 29} fontSize="24" fontWeight="700" className="fill-white stroke-black/70" paintOrder="stroke" strokeWidth="3">
          {zone.label}{seconds === null ? '' : ` · ${formatStopwatch(seconds)}`}
        </text>
      </g>
    );
  };

  return (
    <section className="shrink-0 rounded-2xl border border-border bg-black" aria-label={TEXT.liveCamera}>
      <div className="relative aspect-video overflow-hidden rounded-2xl">
        <canvas ref={canvasRef} width={FRAME_WIDTH} height={FRAME_HEIGHT} className="absolute inset-0 size-full" aria-label={TEXT.liveImage} data-testid="live-camera-canvas" />
        <svg
          viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
          aria-label={TEXT.zoneEditor}
        >
          {detections.map((box, index) => (
            <rect key={index} x={box.x * FRAME_WIDTH} y={box.y * FRAME_HEIGHT} width={box.width * FRAME_WIDTH} height={box.height * FRAME_HEIGHT} className="fill-none stroke-accent/70" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ))}
          {zones.map(drawZone)}
        </svg>
        <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between gap-2 text-xs font-semibold text-white">
          <span className="max-w-[65%] truncate rounded-full bg-black/65 px-3 py-1.5">{name || TEXT.liveCamera} · RTSP</span>
          <span className={`rounded-full px-3 py-1.5 ${status.state === 'live' ? 'bg-live text-black' : 'bg-black/65'}`} data-testid="live-camera-status">{TEXT.liveStatus[status.state]}</span>
        </div>
        {!hasFrame && (
          <div className="pointer-events-none absolute inset-0 grid place-content-center gap-2 px-5 text-center">
            <Camera className="mx-auto size-10 text-fg-subtle" aria-hidden />
            <p className="font-semibold text-white">{TEXT.liveStatus[status.state]}</p>
            <p className="max-w-sm text-sm text-fg-muted">{status.message || TEXT.connectHint}</p>
          </div>
        )}
        {hasFrame && status.state !== 'live' && (
          <div className="pointer-events-none absolute inset-0 grid place-content-center gap-2 bg-black/55 p-5 text-center text-white" role="alert">
            <TriangleAlert className="mx-auto size-8 text-warning" aria-hidden />
            <p className="font-semibold">{TEXT.liveStatus[status.state]}</p>
            <p className="max-w-sm text-sm">{status.message || TEXT.liveStale}</p>
          </div>
        )}
        {hasFrame && status.state === 'live' && detector !== 'ready' && !editorActive && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-xl bg-black/70 p-3 text-sm text-white">
            <ScanSearch className="size-4 shrink-0" aria-hidden />
            {detector === 'error' ? TEXT.detectorError : TEXT.detectorLoading}
          </div>
        )}
      </div>
      {editorActive && <ZoneEditor key={`${drawingMode}:${editingZone?.id ?? 'new'}`} drawingMode={drawingMode} editingZone={editingZone} onZoneDrawn={onZoneDrawn} onZoneUpdated={onZoneUpdated} onCancelDrawing={onCancelDrawing} />}
    </section>
  );
}
