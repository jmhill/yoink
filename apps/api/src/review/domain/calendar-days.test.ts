import { describe, expect, it } from 'vitest';
import { viewerToday } from '../../shared/domain/viewer-today.js';
import { calendarDaysBetween } from './calendar-days.js';

describe('calendarDaysBetween', () => {
  it('counts calendar days, not elapsed hours, across a spring-forward DST gap', () => {
    expect(calendarDaysBetween('2026-03-10', '2026-03-07')).toBe(3);
  });

  it('counts calendar days across a fall-back DST gap', () => {
    expect(calendarDaysBetween('2026-11-03', '2026-10-31')).toBe(3);
  });

  it('treats a late-evening CT instant as that CT calendar day', () => {
    const lastChangeAt = new Date('2026-10-05T04:30:00.000Z');
    const localDate = viewerToday({ now: lastChangeAt, timeZone: 'America/Chicago' });
    expect(localDate).toBe('2026-10-04');
    expect(calendarDaysBetween('2026-10-12', localDate)).toBe(8);
  });

  it('is zero when the two dates are the same', () => {
    expect(calendarDaysBetween('2026-10-12', '2026-10-12')).toBe(0);
  });
});
