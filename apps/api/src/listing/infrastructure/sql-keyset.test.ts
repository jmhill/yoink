import { describe, it, expect } from 'vitest';
import { sqlKeysetClause } from './sql-keyset.js';

describe('sqlKeysetClause', () => {
  it('builds a two-column desc seek', () => {
    const result = sqlKeysetClause({
      columns: ['captured_at', 'id'],
      direction: 'desc',
      seek: { view: 'captures.feed', keys: ['2024-01-01T00:00:00.000Z', 'abc'] },
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.sql).toBe(
      '((captured_at < ?) OR (captured_at = ? AND id < ?))'
    );
    expect(result.value.args).toEqual(['2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', 'abc']);
  });

  it('errors before binding when the cursor key count does not match the columns', () => {
    const result = sqlKeysetClause({
      columns: ['captured_at', 'id'],
      direction: 'desc',
      seek: { view: 'tasks.pile', keys: [1, '2024-01-01T00:00:00.000Z', 'abc'] },
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.type).toBe('STORAGE_ERROR');
    expect(result.error.message).toContain('3 keys');
    expect(result.error.message).toContain('2 columns');
  });
});
