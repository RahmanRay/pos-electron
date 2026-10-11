import { describe, expect, it } from 'vitest';
import { formatClock, formatNumber, formatStopwatch } from '@/utils/format';

describe('formatStopwatch', () => {
  it('shows minutes and seconds, and hours only when needed', () => {
    expect(formatStopwatch(0)).toBe('0:00');
    expect(formatStopwatch(7.9)).toBe('0:07');
    expect(formatStopwatch(750)).toBe('12:30');
    expect(formatStopwatch(3725)).toBe('1:02:05');
    expect(formatStopwatch(-3)).toBe('0:00');
  });
});

describe('formatNumber', () => {
  it('uses the Azerbaijani decimal comma, spaced thousands and rounds', () => {
    expect(formatNumber(2.345, 1)).toBe('2,3');
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatNumber(1464)).toBe('1 464');
    expect(formatNumber(0.5, 2)).toBe('0,5');
    expect(formatNumber(-1234567.25, 1)).toBe('-1 234 567,3');
  });
});

describe('formatClock', () => {
  it('pads hours and minutes', () => {
    expect(formatClock(new Date(2026, 9, 11, 8, 5, 3))).toBe('08:05:03');
  });
});
