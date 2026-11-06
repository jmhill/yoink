import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import { runListedQuery } from './run-listed-query.js';
import type { ListedCursor } from '../domain/keyset-cursor.js';

const boardCursor: ListedCursor<{ id: string }, 'tasks.board'> = {
  view: 'tasks.board',
  of: (item) => ({
    view: 'tasks.board',
    keys: ['', '', item.id],
  }),
};

describe('runListedQuery', () => {
  it('returns InvalidCursor without loading when the cursor is malformed', async () => {
    const result = await runListedQuery({
      cursor: 'nope',
      cursorOf: boardCursor,
      limit: 2,
      load: () => okAsync({ rows: [], total: 0 }),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_CURSOR');
    }
  });
});
