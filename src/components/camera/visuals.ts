import type { ZoneStatus } from '@/types';

/** Source frame size the zones were traced on (the overlay's viewBox). */
export const FRAME_WIDTH = 1280;
export const FRAME_HEIGHT = 720;

/** Tailwind classes per table state. */
export const STATUS_STYLES: Record<
  ZoneStatus,
  { text: string; dot: string; bar: string; stroke: string; fill: string; tile: string }
> = {
  occupied: {
    text: 'text-occupied',
    dot: 'bg-occupied',
    bar: 'bg-occupied',
    stroke: 'stroke-occupied',
    fill: 'fill-occupied',
    tile: 'border-occupied/40 bg-occupied/[0.07]',
  },
  arriving: {
    text: 'text-arriving',
    dot: 'bg-arriving',
    bar: 'bg-arriving',
    stroke: 'stroke-arriving',
    fill: 'fill-arriving',
    tile: 'border-arriving/40 bg-arriving/[0.07]',
  },
  empty: {
    text: 'text-empty',
    dot: 'bg-empty',
    bar: 'bg-empty/35',
    stroke: 'stroke-empty',
    fill: 'fill-empty',
    tile: 'border-border bg-surface-2',
  },
};

/** Card frame shared by the panels. */
export const PANEL = 'rounded-2xl border border-border bg-surface';
