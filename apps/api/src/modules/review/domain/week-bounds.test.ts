import { describe, expect, it } from 'vitest';
import {
  isCalendarMonday,
  localMidnightUtc,
  mondayOnOrBefore,
  weekDates,
  weekUtcBounds,
} from './week-bounds.js';

describe('week-bounds', () => {
  it('accepts a Monday and rejects any other weekday', () => {
    expect(isCalendarMonday('2026-10-12')).toBe(true);
    expect(isCalendarMonday('2026-10-05')).toBe(true);
    expect(isCalendarMonday('2026-10-11')).toBe(false);
    expect(isCalendarMonday('2026-10-13')).toBe(false);
  });

  it('finds the Monday of the week containing Sunday Oct 11', () => {
    expect(mondayOnOrBefore('2026-10-11')).toBe('2026-10-05');
    expect(mondayOnOrBefore('2026-10-12')).toBe('2026-10-12');
    expect(mondayOnOrBefore('2026-10-18')).toBe('2026-10-12');
  });

  it('returns Monday–Sunday calendar dates for a week', () => {
    expect(weekDates('2026-10-12')).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(weekDates('2026-10-05')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('counts Sunday 11:30pm CT in that week', () => {
    const bounds = weekUtcBounds('2026-10-05', 'America/Chicago');
    expect(bounds.start).toBe('2026-10-05T05:00:00.000Z');
    expect(bounds.end).toBe('2026-10-12T05:00:00.000Z');
    const sundayEvening = Date.parse('2026-10-12T04:30:00.000Z');
    expect(sundayEvening).toBeGreaterThanOrEqual(Date.parse(bounds.start));
    expect(sundayEvening).toBeLessThan(Date.parse(bounds.end));
  });

  it('keeps the DST spring-forward Sunday in the week that started Mar 2', () => {
    const bounds = weekUtcBounds('2026-03-02', 'America/Chicago');
    expect(localMidnightUtc('2026-03-02', 'America/Chicago')).toBe('2026-03-02T06:00:00.000Z');
    expect(localMidnightUtc('2026-03-09', 'America/Chicago')).toBe('2026-03-09T05:00:00.000Z');
    expect(bounds.start).toBe('2026-03-02T06:00:00.000Z');
    expect(bounds.end).toBe('2026-03-09T05:00:00.000Z');
    const sundayEvening = Date.parse('2026-03-09T04:30:00.000Z');
    expect(sundayEvening).toBeLessThan(Date.parse(bounds.end));
  });

  it('keeps the DST fall-back Sunday in the week that started Oct 26', () => {
    const bounds = weekUtcBounds('2026-10-26', 'America/Chicago');
    expect(localMidnightUtc('2026-10-26', 'America/Chicago')).toBe('2026-10-26T05:00:00.000Z');
    expect(localMidnightUtc('2026-11-02', 'America/Chicago')).toBe('2026-11-02T06:00:00.000Z');
    expect(bounds.start).toBe('2026-10-26T05:00:00.000Z');
    expect(bounds.end).toBe('2026-11-02T06:00:00.000Z');
    const sundayEvening = Date.parse('2026-11-02T05:30:00.000Z');
    expect(sundayEvening).toBeLessThan(Date.parse(bounds.end));
  });
});
