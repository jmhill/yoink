import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import type { Database } from '../../../platform/database/types.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createUserService } from '../../application/handle-user.js';
import { planCreateUser, decideCreateUser } from '../../domain/decide-create-user.js';
import type { UserStore } from '../../domain/user-store.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compileUserPlan } from './compile-user.js';

const ID = '550e8400-e29b-41d4-a716-446655440099';
const CREATED = '2024-06-01T00:00:00.000Z';

const createPlan = () =>
  planCreateUser(
    decideCreateUser({
      id: ID,
      email: 'new@example.com',
      createdAt: CREATED,
    })
  );

describe('user unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;

  const service = () =>
    createUserService({
      userStore: {
        save: () => {
          throw new Error('user writes go through the unit of work');
        },
        findById: () => {
          throw new Error('create does not query');
        },
        findByEmail: () => {
          throw new Error('create does not query');
        },
        findByNormalizedEmail: () => {
          throw new Error('create does not query');
        },
        findByIds: () => {
          throw new Error('create does not query');
        },
        updateName: () => {
          throw new Error('create does not rename');
        },
      } as unknown as UserStore,
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-user-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'user.db') });
    db = opened.database;
    client = opened.client;
    await runMigrations(db, migrations);
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });
    await client.execute({ sql: 'PRAGMA foreign_keys = ON' });
  });

  afterAll(async () => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await db.execute({ sql: 'DELETE FROM users' });
  });

  it('does not guard the user insert', () => {
    const saved = compileUserPlan(createPlan());
    expect(saved).toHaveLength(1);
    expect(saved[0]?.guard).toBe(false);
    expect(saved[0]?.verb).toBe('insert');
    expect(saved[0]?.sql).toContain('INSERT INTO users (id, email, name, kind, created_at)');
    expect(saved[0]?.sql).not.toContain('WHERE NOT EXISTS');
  });

  it('commits a user and stores an omitted kind as human', async () => {
    const created = await service().createUser({
      id: ID,
      email: 'new@example.com',
      createdAt: CREATED,
    });

    expect(created.isOk() && created._unsafeUnwrap()).toEqual({
      id: ID,
      email: 'new@example.com',
      createdAt: CREATED,
    });
    const row = await db.execute({
      sql: `SELECT id, email, name, kind, created_at AS createdAt FROM users WHERE id = ?`,
      args: [ID],
    });
    expect(row.rows[0]).toEqual({
      id: ID,
      email: 'new@example.com',
      name: null,
      kind: 'human',
      createdAt: CREATED,
    });
  });

  it('keeps a supplied name and kind', async () => {
    const created = await service().createUser({
      id: ID,
      email: 'bot@example.com',
      name: 'Ada',
      kind: 'agent',
      createdAt: CREATED,
    });

    expect(created.isOk() && created._unsafeUnwrap()).toEqual({
      id: ID,
      email: 'bot@example.com',
      name: 'Ada',
      kind: 'agent',
      createdAt: CREATED,
    });
    const row = await db.execute({
      sql: `SELECT name, kind FROM users WHERE id = ?`,
      args: [ID],
    });
    expect(row.rows[0]).toEqual({ name: 'Ada', kind: 'agent' });
  });

  it('maps a duplicate email to storage and leaves the first row', async () => {
    const users = service();
    const first = await users.createUser({
      id: ID,
      email: 'new@example.com',
      createdAt: CREATED,
    });
    expect(first.isOk()).toBe(true);

    const duplicate = await users.createUser({
      id: '550e8400-e29b-41d4-a716-446655440098',
      email: 'new@example.com',
      createdAt: CREATED,
    });

    expect(duplicate.isErr() && duplicate.error.type).toBe('USER_STORAGE_ERROR');
    const rows = await db.execute({ sql: 'SELECT COUNT(*) AS count FROM users' });
    expect(Number(rows.rows[0]?.count)).toBe(1);
  });
});
