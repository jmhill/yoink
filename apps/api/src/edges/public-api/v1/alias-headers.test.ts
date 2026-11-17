import { describe, expect, it } from 'vitest';
import {
  PUBLIC_API_ALIAS_MIN_WINDOW_MS,
  aliasRetirementHttpDates,
  publicApiAliasRetirement,
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

  it('records Justin\'s Sunset and a Deprecation at least 90 days earlier', () => {
    const span =
      publicApiAliasRetirement.sunset.getTime() - publicApiAliasRetirement.deprecation.getTime();
    expect(span).toBeGreaterThanOrEqual(PUBLIC_API_ALIAS_MIN_WINDOW_MS);
    expect(aliasRetirementHttpDates(publicApiAliasRetirement)).toEqual({
      deprecation: 'Tue, 17 Nov 2026 06:07:00 GMT',
      sunset: 'Mon, 01 Mar 2027 00:00:00 GMT',
    });
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
