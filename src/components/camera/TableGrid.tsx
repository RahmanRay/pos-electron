import { EyeOff, Users } from 'lucide-react';
import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import { formatStopwatch } from '@/utils/format';
import { seatedSeconds } from '@/utils/occupancy';
import { PANEL, STATUS_STYLES } from './visuals';

/** One tile per table: state, seating timer, people count. */
export function TableGrid() {
  const snapshot = useCameraStore((state) => state.snapshot);
  const zones = useCameraStore((state) => state.zones);
  const feed = useCameraStore((state) => state.feed);
  const detector = useCameraStore((state) => state.detector);
  const stale = feed !== 'live' || detector !== 'ready';

  return (
    <section className={`${PANEL} p-5`} aria-labelledby="tables-title">
      <h2 id="tables-title" className="mb-3 text-sm font-semibold text-fg-muted">
        {TEXT.tables}
      </h2>
      {stale && zones.length > 0 && <p className="mb-3 text-xs text-warning">{TEXT.lastKnown} · {TEXT.unconfirmed}</p>}
      {zones.length === 0 && <p className="text-sm text-fg-subtle">{TEXT.noLiveZones}</p>}
      <ul className="grid grid-cols-2 gap-2.5" data-testid="camera-zones">
        {zones.map((zone) => {
          const state = snapshot.zones.find((candidate) => candidate.zoneId === zone.id);
          if (!state) return null;
          const style = STATUS_STYLES[state.status];
          const seconds = seatedSeconds(state, snapshot.time);
          return (
            <li
              key={zone.id}
              data-zone={zone.label}
              data-status={stale ? 'unknown' : state.status}
              aria-label={`${TEXT.table(zone.label)}: ${stale ? TEXT.unconfirmed : TEXT.status[state.status]}`}
              className={`rounded-xl border p-3 transition-colors duration-200 ${style.tile} ${stale ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold">{zone.label}</span>
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${style.text}`}>
                  <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
                  {stale ? TEXT.unconfirmed : TEXT.status[state.status]}
                </span>
              </div>
              <div className="mt-2 font-mono text-lg font-semibold tabular-nums" data-testid={seconds === null ? undefined : 'zone-timer'}>
                {seconds === null ? <span className="text-fg-subtle">—:——</span> : formatStopwatch(seconds)}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                {state.hidden ? (
                  <>
                    <EyeOff className="size-3.5 text-warning" aria-hidden />
                    <span className="truncate text-warning" title={TEXT.hidden}>
                      {TEXT.hidden}
                    </span>
                  </>
                ) : (
                  <>
                    <Users className="size-3.5" aria-hidden />
                    {TEXT.people(state.people)}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
