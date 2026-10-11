import { describe, it, expect } from 'vitest';
import { NowOwnerSchema, TimeZoneSchema, WorkNowQuerySchema } from './work.js';

describe('NowOwnerSchema', () => {
  it('parses all and me', () => {
    expect(NowOwnerSchema.parse('all')).toBe('all');
    expect(NowOwnerSchema.parse('me')).toBe('me');
  });

  it('rejects a missing or bogus owner on the enum itself', () => {
    expect(NowOwnerSchema.safeParse(undefined).success).toBe(false);
    expect(NowOwnerSchema.safeParse('bogus').success).toBe(false);
  });

  it('defaults a missing owner to all on the Now query', () => {
    const parsed = WorkNowQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.owner).toBe('all');
    }
  });

  it('rejects a bogus owner on the Now query', () => {
    expect(WorkNowQuerySchema.safeParse({ owner: 'bogus' }).success).toBe(false);
  });
});

describe('TimeZoneSchema', () => {
  it('accepts America/Chicago and UTC', () => {
    expect(TimeZoneSchema.parse('America/Chicago')).toBe('America/Chicago');
    expect(TimeZoneSchema.parse('UTC')).toBe('UTC');
  });

  it('rejects a bogus IANA zone', () => {
    expect(TimeZoneSchema.safeParse('Not/AZone').success).toBe(false);
  });
});
