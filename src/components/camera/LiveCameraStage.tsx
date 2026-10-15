import { useState, type PointerEvent, type RefObject } from 'react';
import { Camera, ScanSearch, TriangleAlert } from 'lucide-react';
import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import type { CameraZone, NormalizedPoint } from '@/types';
import type { LiveCameraStatus } from '@/types/liveCamera';
import { formatStopwatch } from '@/utils/format';
import { seatedSeconds } from '@/utils/occupancy';
import { FRAME_HEIGHT, FRAME_WIDTH, STATUS_STYLES } from './visuals';

interface LiveCameraStageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  name: string;
  status: LiveCameraStatus;
  hasFrame: boolean;
  drawingEnabled: boolean;
  onZoneDrawn: (polygon: NormalizedPoint[]) => void;
}

function pointerPoint(event: PointerEvent<SVGSVGElement>): NormalizedPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

/** Live image and user-defined table areas share the same normalized coordinates. */
export function LiveCameraStage({ canvasRef, name, status, hasFrame, drawingEnabled, onZoneDrawn }: LiveCameraStageProps) {
  const zones = useCameraStore((state) => state.zones);
  const snapshot = useCameraStore((state) => state.snapshot);
  const detections = useCameraStore((state) => state.detections);
  const detector = useCameraStore((state) => state.detector);
  const [drag, setDrag] = useState<{ start: NormalizedPoint; end: NormalizedPoint } | null>(null);
  const reliable = status.state === 'live' && detector === 'ready';

  const finishDrawing = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const end = pointerPoint(event);
    const x1 = Math.min(drag.start.x, end.x);
    const x2 = Math.max(drag.start.x, end.x);
    const y1 = Math.min(drag.start.y, end.y);
    const y2 = Math.max(drag.start.y, end.y);
    setDrag(null);
    if (x2 - x1 >= 0.015 && y2 - y1 >= 0.015) {
      onZoneDrawn([{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]);
    }
  };

  const drawZone = (zone: CameraZone) => {
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
          className={`absolute inset-0 size-full ${drawingEnabled && hasFrame ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
          aria-label={drawingEnabled ? TEXT.drawZoneLabel : TEXT.zoneEditor}
          onPointerDown={(event) => {
            if (!drawingEnabled || !hasFrame || status.state !== 'live') return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = pointerPoint(event);
            setDrag({ start: point, end: point });
          }}
          onPointerMove={(event) => {
            if (drag) setDrag({ start: drag.start, end: pointerPoint(event) });
          }}
          onPointerUp={finishDrawing}
          onPointerCancel={() => setDrag(null)}
        >
          {detections.map((box, index) => (
            <rect key={index} x={box.x * FRAME_WIDTH} y={box.y * FRAME_HEIGHT} width={box.width * FRAME_WIDTH} height={box.height * FRAME_HEIGHT} className="fill-none stroke-accent/70" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ))}
          {zones.map(drawZone)}
          {drag && (
            <rect x={Math.min(drag.start.x, drag.end.x) * FRAME_WIDTH} y={Math.min(drag.start.y, drag.end.y) * FRAME_HEIGHT} width={Math.abs(drag.end.x - drag.start.x) * FRAME_WIDTH} height={Math.abs(drag.end.y - drag.start.y) * FRAME_HEIGHT} className="fill-accent/20 stroke-accent" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="6 4" />
          )}
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
        {hasFrame && status.state === 'live' && detector !== 'ready' && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-xl bg-black/70 p-3 text-sm text-white">
            <ScanSearch className="size-4 shrink-0" aria-hidden />
            {detector === 'error' ? TEXT.detectorError : TEXT.detectorLoading}
          </div>
        )}
      </div>
    </section>
  );
}
