/**
 * Azerbaijani number style: decimal comma, space between thousands ("1 464", "0,5").
 * Written by hand because browsers differ in how much of the az-AZ locale they ship.
 */
export function formatNumber(value: number, maxFractionDigits = 0): string {
  const safe = Number.isFinite(value) ? value : 0;
  const [whole = '0', fraction = ''] = safe.toFixed(maxFractionDigits).split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = (sign ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const trimmed = fraction.replace(/0+$/, '');
  return `${sign}${digits}${trimmed ? `,${trimmed}` : ''}`;
}

/** Seconds as a stopwatch reading: "0:07", "12:30", "1:02:05". */
export function formatStopwatch(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

/** Wall-clock time "20:15:04". */
export function formatClock(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
}
