import { EyeOff, Users } from 'lucide-react';
import { CAMERA_DEMO_ZONES } from '@/data/cameraDemo';
import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import { formatStopwatch } from '@/utils/format';
import { seatedSeconds } from '@/utils/occupancy';
import { PANEL, STATUS_STYLES } from './visuals';

/** One tile per table: state, seating timer, people count. */
export function TableGrid() {
  const snapshot = useCameraStore((state) => state.snapshot);

  return (
    <section className={`${PANEL} p-5`} aria-labelledby="tables-title">
      <h2 id="tables-title" className="mb-3 text-sm font-semibold text-fg-muted">
        {TEXT.tables}
      </h2>
      <ul className="grid grid-cols-2 gap-2.5" data-testid="camera-zones">
        {CAMERA_DEMO_ZONES.map((zone) => {
          const state = snapshot.zones.find((candidate) => candidate.zoneId === zone.id);
          if (!state) return null;
          const style = STATUS_STYLES[state.status];
          const seconds = seatedSeconds(state, snapshot.time);
          return (
            <li
              key={zone.id}
              data-zone={zone.label}
              data-status={state.status}
              aria-label={`${TEXT.table(zone.label)}: ${TEXT.status[state.status]}`}
              className={`rounded-xl border p-3 transition-colors duration-200 ${style.tile}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold">{zone.label}</span>
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${style.text}`}>
                  <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
                  {TEXT.status[state.status]}
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
