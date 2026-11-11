import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import { beginSameConnectionTransaction, createDatabase, openDatabase } from './database.js';

describe('createDatabase', () => {
  let cleanupPath: string | undefined;

  afterEach(async () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { recursive: true, force: true });
      cleanupPath = undefined;
    }
  });

  it('creates the parent directory when opening a file database', async () => {
    const root = join(tmpdir(), `yoink-db-${randomUUID()}`);
    cleanupPath = root;
    const path = join(root, 'nested', 'captures.db');

    expect(existsSync(join(root, 'nested'))).toBe(false);

    const db = createDatabase({ type: 'file', path });
    expect(existsSync(join(root, 'nested'))).toBe(true);

    await db.close();
  });
});

describe('openDatabase', () => {
  let cleanupPath: string | undefined;

  afterEach(async () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { recursive: true, force: true });
      cleanupPath = undefined;
    }
  });

  it('keeps queries and write transactions off the same client at once', async () => {
    const root = join(tmpdir(), `yoink-db-${randomUUID()}`);
    cleanupPath = root;
    const { database, writeClient } = openDatabase({
      type: 'file',
      path: join(root, 'captures.db'),
    });
    await database.execute({
      sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)',
    });

    const writes = Array.from({ length: 40 }, async (_, index) => {
      const tx = await writeClient.transaction('write');
      await tx.batch([
        { sql: 'INSERT INTO notes (body) VALUES (?)', args: [`n${index}`] },
      ]);
      await tx.commit();
      await tx.close();
    });
    const reads = Array.from({ length: 40 }, () =>
      database.execute({ sql: 'SELECT COUNT(*) AS n FROM notes' })
    );

    await Promise.all([...writes, ...reads]);

    const count = await database.execute({
      sql: 'SELECT COUNT(*) AS n FROM notes',
    });
    expect(Number(count.rows[0]?.n)).toBe(40);
    await database.close();
  });

  it('serves a query while a write transaction is still open', async () => {
    const root = join(tmpdir(), `yoink-db-${randomUUID()}`);
    cleanupPath = root;
    const { database, writeClient } = openDatabase({
      type: 'file',
      path: join(root, 'captures.db'),
    });
    await database.execute({
      sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)',
    });

    const tx = await writeClient.transaction('write');
    await tx.batch([{ sql: 'INSERT INTO notes (body) VALUES (?)', args: ['held'] }]);
    const read = database.execute({ sql: 'SELECT COUNT(*) AS n FROM notes' });
    const winner = await Promise.race([
      read.then(() => 'read' as const),
      new Promise<'blocked'>((resolve) => {
        setTimeout(() => resolve('blocked'), 500);
      }),
    ]);

    expect(winner).toBe('read');
    const count = await read;
    expect(Number(count.rows[0]?.n)).toBe(0);
    await tx.rollback();
    await tx.close();
    await database.close();
  });

  it('does not keep a native connection for every write transaction', async () => {
    const root = join(tmpdir(), `yoink-db-${randomUUID()}`);
    cleanupPath = root;
    const { database, writeClient } = openDatabase({
      type: 'file',
      path: join(root, 'captures.db'),
    });
    await database.execute({
      sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)',
    });
    const before = readdirSync('/proc/self/fd').length;

    for (let index = 0; index < 40; index += 1) {
      const tx = await writeClient.transaction('write');
      await tx.batch([
        { sql: 'INSERT INTO notes (body) VALUES (?)', args: [`n${index}`] },
      ]);
      await tx.commit();
      await tx.close();
    }

    const after = readdirSync('/proc/self/fd').length;
    expect(after - before).toBeLessThan(10);
    const count = await database.execute({
      sql: 'SELECT COUNT(*) AS n FROM notes',
    });
    expect(Number(count.rows[0]?.n)).toBe(40);
    await database.close();
  });
});

describe('beginSameConnectionTransaction', () => {
  it('holds the write lock until close finishes rolling back', async () => {
    let releaseRollback: () => void = () => undefined;
    const rollbackHeld = new Promise<void>((resolve) => {
      releaseRollback = resolve;
    });
    let releases = 0;
    const client = {
      execute: async (statement: string | { sql: string }) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        if (sql === 'ROLLBACK') {
          await rollbackHeld;
        }
        return { rowsAffected: 0, columns: [], rows: [] };
      },
    } as unknown as Client;

    const tx = await beginSameConnectionTransaction(client, () => {
      releases += 1;
    });
    await tx.batch([{ sql: 'INSERT INTO notes (body) VALUES (?)', args: ['ghost'] }]);
    const closing = tx.close();
    await Promise.resolve();

    expect(releases).toBe(0);
    releaseRollback();
    await closing;
    expect(releases).toBe(1);
  });

  it('releases the write lock when rollback fails', async () => {
    let releases = 0;
    const client = {
      execute: async (statement: string | { sql: string }) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        if (sql === 'ROLLBACK') {
          throw new Error('rollback failed');
        }
        return { rowsAffected: 0, columns: [], rows: [] };
      },
    } as unknown as Client;

    const tx = await beginSameConnectionTransaction(client, () => {
      releases += 1;
    });
    await tx.batch([{ sql: 'INSERT INTO notes (body) VALUES (?)', args: ['ghost'] }]);
    await tx.close();

    expect(releases).toBe(1);
  });
});
