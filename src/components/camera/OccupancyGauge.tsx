import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import type { ZoneStatus } from '@/types';
import { formatNumber } from '@/utils/format';
import { PANEL, STATUS_STYLES } from './visuals';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ORDER: ZoneStatus[] = ['occupied', 'arriving', 'empty'];

/** Donut of occupied / arriving tables with the live numbers next to it. */
export function OccupancyGauge() {
  const zones = useCameraStore((state) => state.snapshot.zones);
  const people = useCameraStore((state) => state.detections.length);
  const inferenceMs = useCameraStore((state) => state.inferenceMs);
  const total = zones.length || 1;
  const count = (status: ZoneStatus) => zones.filter((zone) => zone.status === status).length;
  const occupied = count('occupied');
  const arriving = count('arriving');
  const occupiedLength = (occupied / total) * CIRCUMFERENCE;
  const arrivingLength = (arriving / total) * CIRCUMFERENCE;

  return (
    <section className={`${PANEL} p-5`} aria-labelledby="gauge-title" data-testid="camera-summary">
      <h2 id="gauge-title" className="mb-4 text-sm font-semibold text-fg-muted">
        {TEXT.occupancy}
      </h2>
      <div className="flex items-center gap-5">
        <div className="relative size-32 shrink-0">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r={RADIUS} className="fill-none stroke-surface-3" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              opacity={arriving ? 1 : 0}
              className="fill-none stroke-arriving transition-[stroke-dasharray,stroke-dashoffset] duration-700"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${arrivingLength} ${CIRCUMFERENCE}`}
              strokeDashoffset={-occupiedLength}
            />
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              opacity={occupied ? 1 : 0}
              className="fill-none stroke-occupied transition-[stroke-dasharray] duration-700"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${occupiedLength} ${CIRCUMFERENCE}`}
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <span className="text-3xl font-bold tabular-nums">{formatNumber((occupied / total) * 100)}%</span>
            <span className="text-[0.6875rem] text-fg-muted">{TEXT.occupiedOf(occupied, zones.length)}</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2.5">
          {ORDER.map((status) => (
            <li key={status} className="flex items-center gap-2.5 text-sm">
              <span className={`size-2.5 rounded-full ${STATUS_STYLES[status].dot}`} aria-hidden />
              <span className="flex-1 text-fg-muted">{TEXT.status[status]}</span>
              <span className="font-mono text-base font-bold tabular-nums">{count(status)}</span>
            </li>
          ))}
        </ul>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <dt className="text-xs text-fg-subtle">{TEXT.peopleInFrame}</dt>
          <dd className="font-semibold">{TEXT.people(people)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">{TEXT.inference}</dt>
          <dd className="font-mono font-semibold tabular-nums">{inferenceMs === null ? '—' : `${formatNumber(Math.round(inferenceMs))} ms`}</dd>
        </div>
      </dl>
    </section>
  );
}
