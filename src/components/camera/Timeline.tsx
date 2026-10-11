import { CirclePause, CirclePlay, RotateCcw, Unplug } from 'lucide-react';
import type { ReactNode } from 'react';
import { APP_CONFIG } from '@/config/app.config';
import { CAMERA_DEMO_ZONES } from '@/data/cameraDemo';
import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import { formatNumber, formatStopwatch } from '@/utils/format';
import { PANEL, STATUS_STYLES } from './visuals';

export interface TimelineProps {
  onTogglePause: () => void;
  onToggleFreeze: () => void;
  onRestart: () => void;
}

function ControlButton({
  label,
  icon,
  onClick,
  active,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={label}
      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
        active ? 'border-warning bg-warning text-warning-fg' : 'border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3'
      }`}
    >
      {icon}
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}

/** Video time, playback controls and the status history of every table in this loop. */
export function Timeline({ onTogglePause, onToggleFreeze, onRestart }: TimelineProps) {
  const timeline = useCameraStore((state) => state.timeline);
  const time = useCameraStore((state) => state.snapshot.time);
  const session = useCameraStore((state) => state.snapshot.session);
  const duration = useCameraStore((state) => state.duration);
  const feed = useCameraStore((state) => state.feed);
  const simulatingStall = useCameraStore((state) => state.simulatingStall);
  const unavailable = feed === 'missing' || feed === 'error' || feed === 'loading';
  const span = Math.max(duration, time, 1);
  const percent = (value: number) => `${(Math.min(value, span) / span) * 100}%`;

  return (
    <section className={`${PANEL} shrink-0 p-4 sm:px-5`} aria-labelledby="timeline-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-2xl font-semibold tracking-wider tabular-nums" data-testid="camera-time">
            {formatStopwatch(time)}
          </span>
          <span className="text-xs text-fg-muted">
            {TEXT.speed(formatNumber(APP_CONFIG.camera.playbackRate, 2))} · {TEXT.session(session)}
          </span>
        </div>
        <div className="flex gap-2">
          <ControlButton
            label={feed === 'paused' ? TEXT.resume : TEXT.pause}
            icon={feed === 'paused' ? <CirclePlay className="size-4" aria-hidden /> : <CirclePause className="size-4" aria-hidden />}
            onClick={onTogglePause}
            disabled={unavailable}
          />
          <ControlButton
            label={simulatingStall ? TEXT.endFreezeTest : TEXT.freezeTest}
            icon={<Unplug className="size-4" aria-hidden />}
            onClick={onToggleFreeze}
            active={simulatingStall}
            disabled={unavailable && !simulatingStall}
          />
          <ControlButton label={TEXT.restart} icon={<RotateCcw className="size-4" aria-hidden />} onClick={onRestart} disabled={unavailable} />
        </div>
      </div>

      <h2 id="timeline-title" className="sr-only">
        {TEXT.timeline}
      </h2>
      <div className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
        {CAMERA_DEMO_ZONES.map((zone) => (
          <div key={zone.id} className="contents">
            <span className="text-center font-mono text-xs font-bold text-fg-muted">{zone.label}</span>
            <div className="relative h-2 overflow-hidden rounded-full bg-surface-3">
              {(timeline.zones[zone.id] ?? []).map((segment, index) => (
                <span
                  key={index}
                  className={`absolute inset-y-0 rounded-full ${STATUS_STYLES[segment.status].bar}`}
                  style={{ left: percent(segment.from), width: `max(3px, ${percent(segment.to - segment.from)})` }}
                />
              ))}
            </div>
          </div>
        ))}
        <span />
        <div className="flex justify-between font-mono text-[0.6875rem] text-fg-subtle">
          <span>0:00</span>
          <span title={TEXT.timelineHint}>{formatStopwatch(span)}</span>
        </div>
        {/* Playhead over the tracks (second column). */}
        <span className="pointer-events-none absolute inset-y-0 start-[calc(1.25rem+0.75rem)] end-0" aria-hidden>
          <span
            className="absolute -top-1 bottom-4 w-0.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_10px_var(--c-accent)]"
            style={{ left: percent(time) }}
          />
        </span>
      </div>
    </section>
  );
}
