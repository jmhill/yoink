import { describe, it, expect } from 'vitest';
import {
  HISTORY_PAGE_DEFAULT,
  PILE_SAFETY_CAP,
  ListPageMetaSchema,
  ListPageQuerySchema,
  resolveListLimit,
} from './list-page.js';

describe('list page contract', () => {
  it('caps pile reads at 1000 and defaults history to 50', () => {
    expect(PILE_SAFETY_CAP).toBe(1000);
    expect(HISTORY_PAGE_DEFAULT).toBe(50);
    expect(resolveListLimit(undefined, 'pile')).toBe(1000);
    expect(resolveListLimit(undefined, 'history')).toBe(50);
    expect(resolveListLimit(5, 'pile')).toBe(5);
    expect(resolveListLimit(2000, 'pile')).toBe(1000);
  });

  it('requires hasMore and an explicit nextCursor (null when done)', () => {
    const done = ListPageMetaSchema.safeParse({
      hasMore: false,
      nextCursor: null,
      total: 3,
    });
    expect(done.success).toBe(true);

    const missingCursor = ListPageMetaSchema.safeParse({
      hasMore: false,
      total: 3,
    });
    expect(missingCursor.success).toBe(false);
  });

  it('accepts optional limit and cursor on the query string', () => {
    const parsed = ListPageQuerySchema.safeParse({
      limit: '50',
      cursor: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(50);
    }
  });
});
