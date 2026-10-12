import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import type { OccupancyEventKind } from '@/types';
import { formatNumber, formatStopwatch } from '@/utils/format';
import { PANEL } from './visuals';

const DOT: Record<OccupancyEventKind, string> = {
  seated: 'bg-occupied',
  left: 'bg-empty',
  passedBy: 'bg-fg-subtle',
};

/** Seated / left / passed-by events of the current session, newest first. */
export function EventFeed() {
  const events = useCameraStore((state) => state.snapshot.events);
  const zones = useCameraStore((state) => state.zones);

  return (
    <section className={`${PANEL} flex min-h-0 flex-col p-5`} aria-labelledby="events-title">
      <h2 id="events-title" className="mb-3 text-sm font-semibold text-fg-muted">
        {TEXT.events}
      </h2>
      {events.length > 0 && <p className="mb-3 text-xs text-fg-subtle">{TEXT.liveEventsHint}</p>}
      {events.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-subtle">{TEXT.noEvents}</p>
      ) : (
        <ol className="relative max-h-64 space-y-3 overflow-y-auto ps-4 before:absolute before:inset-y-1 before:start-[3px] before:w-px before:bg-border" data-testid="camera-events">
          {[...events].reverse().map((event) => {
            const label = zones.find((zone) => zone.id === event.zoneId)?.label ?? event.zoneId;
            return (
              <li key={event.id} data-kind={event.kind} className="relative flex items-baseline gap-3 text-sm">
                <span className={`absolute -start-4 top-1.5 size-[7px] rounded-full ${DOT[event.kind]}`} aria-hidden />
                <span className="min-w-0 flex-1">{TEXT.event(event.kind, label, TEXT.seconds(formatNumber(event.duration ?? 0, 1)))}</span>
                <span className="shrink-0 font-mono text-xs text-fg-subtle tabular-nums">{formatStopwatch(event.at)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
