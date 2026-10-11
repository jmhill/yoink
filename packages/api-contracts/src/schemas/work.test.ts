import { describe, it, expect } from 'vitest';
import {
  NowOwnerSchema,
  TimeZoneSchema,
  ViewerTodayQuerySchema,
  WorkDueQuerySchema,
  WorkNextActionsQuerySchema,
} from './work.js';

describe('NowOwnerSchema', () => {
  it('parses all and me', () => {
    expect(NowOwnerSchema.parse('all')).toBe('all');
    expect(NowOwnerSchema.parse('me')).toBe('me');
  });

  it('rejects a missing or bogus owner on the enum itself', () => {
    expect(NowOwnerSchema.safeParse(undefined).success).toBe(false);
    expect(NowOwnerSchema.safeParse('bogus').success).toBe(false);
  });

  it('defaults a missing owner to all on the next-actions and due queries', () => {
    const next = WorkNextActionsQuerySchema.safeParse({});
    expect(next.success).toBe(true);
    if (next.success) {
      expect(next.data.owner).toBe('all');
      expect('timeZone' in next.data).toBe(false);
    }
    const due = WorkDueQuerySchema.safeParse({});
    expect(due.success).toBe(true);
    if (due.success) {
      expect(due.data.owner).toBe('all');
    }
  });

  it('rejects a bogus owner on the next-actions and due queries', () => {
    expect(WorkNextActionsQuerySchema.safeParse({ owner: 'bogus' }).success).toBe(false);
    expect(WorkDueQuerySchema.safeParse({ owner: 'bogus' }).success).toBe(false);
  });

  it('strips a leftover today= instead of treating it as viewer today', () => {
    expect(ViewerTodayQuerySchema.parse({ today: '2026-10-11', timeZone: 'UTC' })).toEqual({
      timeZone: 'UTC',
    });
    expect('today' in WorkDueQuerySchema.parse({ today: '2026-10-11' })).toBe(false);
  });
});

describe('TimeZoneSchema', () => {
  it('accepts America/Chicago and UTC', () => {
    expect(TimeZoneSchema.parse('America/Chicago')).toBe('America/Chicago');
    expect(TimeZoneSchema.parse('UTC')).toBe('UTC');
  });

  it('rejects a bogus IANA zone', () => {
    expect(TimeZoneSchema.safeParse('Not/AZone').success).toBe(false);
    expect(TimeZoneSchema.safeParse('Mars/Base').success).toBe(false);
  });
});
