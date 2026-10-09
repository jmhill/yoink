import { describe, it, expect } from 'vitest';
import {
  HISTORY_PAGE_DEFAULT,
  PILE_SAFETY_CAP,
  ListPageMetaSchema,
  ListPageQuerySchema,
} from './list-page.js';

describe('list page contract', () => {
  it('exports the pile cap and history default for clients', () => {
    expect(PILE_SAFETY_CAP).toBe(1000);
    expect(HISTORY_PAGE_DEFAULT).toBe(50);
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

  it('accepts opaque cursors, not only UUIDs', () => {
    const parsed = ListPageQuerySchema.safeParse({
      limit: '50',
      cursor: 'eyJrIjpbImNvbXBsZXRlZCIsImlkIl19',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(50);
    }
  });
});
