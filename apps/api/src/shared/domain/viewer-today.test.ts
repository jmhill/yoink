import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIEWER_TIME_ZONE,
  resolveViewerToday,
  viewerToday,
} from './viewer-today.js';

describe('viewerToday', () => {
  it('uses America/Chicago at 8pm CT so the date stays the Chicago calendar day', () => {
    // 8:00pm CDT on 2026-10-11 is 2026-10-12T01:00:00.000Z (UTC−5).
    const now = new Date('2026-10-12T01:00:00.000Z');
    expect(viewerToday({ now, timeZone: 'America/Chicago' })).toBe('2026-10-11');
    expect(viewerToday({ now, timeZone: 'UTC' })).toBe('2026-10-12');
  });

  it('keeps the same calendar day when Chicago and UTC still agree', () => {
    const now = new Date('2025-01-15T10:00:00.000Z');
    expect(viewerToday({ now, timeZone: 'America/Chicago' })).toBe('2025-01-15');
    expect(viewerToday({ now, timeZone: 'UTC' })).toBe('2025-01-15');
  });
});

describe('resolveViewerToday', () => {
  it('defaults a missing time zone to America/Chicago', () => {
    expect(DEFAULT_VIEWER_TIME_ZONE).toBe('America/Chicago');
    expect(
      resolveViewerToday({
        now: new Date('2026-10-12T01:00:00.000Z'),
      })
    ).toBe('2026-10-11');
  });

  it('uses the supplied IANA zone', () => {
    expect(
      resolveViewerToday({
        now: new Date('2026-10-12T01:00:00.000Z'),
        timeZone: 'UTC',
      })
    ).toBe('2026-10-12');
  });
});
