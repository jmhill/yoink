import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libsql/client', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@libsql/client';
import { createDatabase } from './database.js';

const execute = vi.fn();
const batch = vi.fn();
const close = vi.fn();

describe('Turso calls', () => {
  beforeEach(() => {
    execute.mockReset();
    batch.mockReset();
    close.mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockReturnValue({
      execute,
      batch,
      close,
    } as unknown as ReturnType<typeof createClient>);
  });

  it('retries a slow execute once and returns the second result', async () => {
    execute
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockImplementationOnce(async () => ({
        rows: [{ id: 'token-1' }],
        rowsAffected: 0,
        lastInsertRowid: undefined,
      }));

    const db = createDatabase(
      { type: 'turso', url: 'libsql://example.turso.io', authToken: 'auth-token' },
      { tursoCallTimeoutMs: 20 }
    );
    const result = await db.execute({ sql: 'select id from api_tokens where id = ?', args: ['token-1'] });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.rows).toEqual([{ id: 'token-1' }]);
    const config = vi.mocked(createClient).mock.calls[0]?.[0];
    expect(config).toMatchObject({
      url: 'libsql://example.turso.io',
      authToken: 'auth-token',
    });
    expect(typeof config?.fetch).toBe('function');
  });

  it('retries a connection failure once and then rejects', async () => {
    const failure = Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
    execute.mockRejectedValue(failure);

    const db = createDatabase(
      { type: 'turso', url: 'libsql://example.turso.io' },
      { tursoCallTimeoutMs: 20 }
    );

    await expect(db.execute({ sql: 'select 1' })).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not retry a SQL error', async () => {
    const failure = Object.assign(new Error('no such table'), { code: 'SQLITE_ERROR' });
    batch.mockRejectedValueOnce(failure);

    const db = createDatabase(
      { type: 'turso', url: 'libsql://example.turso.io' },
      { tursoCallTimeoutMs: 20 }
    );

    await expect(db.batch([{ sql: 'select 1' }])).rejects.toBe(failure);
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('does not retry a local database', async () => {
    const failure = Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
    execute.mockRejectedValueOnce(failure);

    const db = createDatabase({ type: 'memory' }, { tursoCallTimeoutMs: 20 });

    await expect(db.execute({ sql: 'select 1' })).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createClient).mock.calls[0]?.[0]).toEqual({ url: ':memory:' });
  });
});
