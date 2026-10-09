import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import { runListedQuery } from './run-listed-query.js';

describe('runListedQuery', () => {
  it('returns InvalidCursor without loading when the cursor is malformed', async () => {
    const result = await runListedQuery({
      cursor: 'nope',
      view: 'tasks.board',
      limit: 2,
      cursorOf: (item: { id: string }) => ({
        view: 'tasks.board',
        keys: ['', '', item.id],
      }),
      load: () => okAsync({ rows: [], total: 0 }),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_CURSOR');
    }
  });
});
