import { describe, expect, it } from 'vitest';
import {
  PUBLIC_API_ALIAS_MIN_WINDOW_MS,
  aliasRetirementHttpDates,
  v1SuccessorPath,
} from './alias-headers.js';

describe('public API alias headers', () => {
  it('maps an alias URL onto the v1 path and keeps the query', () => {
    expect(v1SuccessorPath('/api/captures/abc?cursor=1')).toBe('/api/v1/captures/abc?cursor=1');
  });

  it('rejects a retirement window shorter than 90 days', () => {
    const deprecation = new Date('2026-01-01T00:00:00.000Z');
    const sunset = new Date(deprecation.getTime() + PUBLIC_API_ALIAS_MIN_WINDOW_MS - 1);
    expect(() => aliasRetirementHttpDates({ deprecation, sunset })).toThrow(/90-day minimum/);
  });

  it('formats an explicit 90-day window as HTTP dates', () => {
    const deprecation = new Date('2026-01-01T00:00:00.000Z');
    const sunset = new Date(deprecation.getTime() + PUBLIC_API_ALIAS_MIN_WINDOW_MS);
    expect(aliasRetirementHttpDates({ deprecation, sunset })).toEqual({
      deprecation: 'Thu, 01 Jan 2026 00:00:00 GMT',
      sunset: 'Wed, 01 Apr 2026 00:00:00 GMT',
    });
  });
});
