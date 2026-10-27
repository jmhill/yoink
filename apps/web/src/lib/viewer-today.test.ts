import { describe, expect, it } from 'vitest';
import { calendarDateInTimeZone } from './viewer-today';

describe('calendarDateInTimeZone', () => {
  it('reads the calendar day in the given zone', () => {
    const now = new Date('2026-10-12T01:00:00.000Z');
    expect(calendarDateInTimeZone(now, 'America/Chicago')).toBe('2026-10-11');
    expect(calendarDateInTimeZone(now, 'UTC')).toBe('2026-10-12');
  });
});
