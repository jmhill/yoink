import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Client } from '@libsql/client';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import type { Database } from '../../../platform/database/types.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createOrganizationService } from '../../application/handle-organization.js';
import { planSaveOrganization } from '../../domain/decide-save-organization.js';
import type { OrganizationPlan } from '../../domain/organization-plan.js';
import type { OrganizationStore } from '../../domain/organization-store.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compileOrganizationPlan } from './compile-organization.js';

const NOW = '2024-01-15T10:00:00.000Z';
const ORG = '550e8400-e29b-41d4-a716-446655440001';
const GENERATED = '550e8400-e29b-41d4-a716-446655440099';
const MIRROR = '550e8400-e29b-41d4-a716-446655440010';

const savePlan = (): OrganizationPlan =>
  planSaveOrganization({
    decision: { name: 'Polly UX' },
    generatedId: ORG,
    now: NOW,
  });

describe('organization unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;

  const clear = async () => {
    await db.execute({ sql: 'DELETE FROM organizations' });
  };

  const service = () =>
    createOrganizationService({
      organizationStore: {
        save: () => {
          throw new Error('organization writes go through the unit of work');
        },
        findById: () => {
          throw new Error('create does not query');
        },
        findAll: () => {
          throw new Error('create does not query');
        },
      } as unknown as OrganizationStore,
      clock: createFakeClock(new Date(NOW)),
      idGenerator: createFakeIdGenerator([GENERATED, '550e8400-e29b-41d4-a716-446655440098']),
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-organization-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'organization.db') });
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
    await clear();
  });

  it('does not guard the organization upsert and does not name the mirror column', () => {
    const saved = compileOrganizationPlan(savePlan());
    expect(saved).toHaveLength(1);
    expect(saved[0]?.guard).toBe(false);
    expect(saved[0]?.verb).toBe('insert');
    expect(saved[0]?.sql).toContain('INSERT INTO organizations (id, name, created_at)');
    expect(saved[0]?.sql).toContain('ON CONFLICT(id) DO UPDATE SET name = excluded.name');
    expect(saved[0]?.sql).not.toContain('notes_mirror_bot_user_id');
    expect(saved[0]?.sql).not.toContain('time_zone');
  });

  it('commits a new workspace and leaves the mirror column empty', async () => {
    const created = await service().createOrganization({ name: 'Polly UX' });

    expect(created.isOk() && created._unsafeUnwrap()).toEqual({
      id: GENERATED,
      name: 'Polly UX',
      createdAt: NOW,
    });
    const row = await db.execute({
      sql: `SELECT id, name, created_at AS createdAt, time_zone AS timeZone,
              notes_mirror_bot_user_id AS mirror
            FROM organizations WHERE id = ?`,
      args: [GENERATED],
    });
    expect(row.rows[0]).toEqual({
      id: GENERATED,
      name: 'Polly UX',
      createdAt: NOW,
      timeZone: 'America/Chicago',
      mirror: null,
    });
  });

  it('uses a supplied id and createdAt and does not consume the generator', async () => {
    const organizations = service();
    const created = await organizations.createOrganization({
      id: ORG,
      name: 'Custom ID Org',
      createdAt: '2023-06-15T12:00:00.000Z',
    });

    expect(created.isOk() && created._unsafeUnwrap().id).toBe(ORG);
    expect(created.isOk() && created._unsafeUnwrap().createdAt).toBe('2023-06-15T12:00:00.000Z');

    const next = await organizations.createOrganization({ name: 'Second' });
    expect(next.isOk() && next._unsafeUnwrap().id).toBe(GENERATED);
  });

  it('updates the name and leaves the mirror bot, time zone, and created_at', async () => {
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at, time_zone, notes_mirror_bot_user_id)
            VALUES (?, ?, ?, ?, ?)`,
      args: [ORG, 'Polly UX', '2024-01-01T00:00:00.000Z', 'Pacific/Auckland', MIRROR],
    });

    const created = await service().createOrganization({
      id: ORG,
      name: 'Renamed',
      createdAt: NOW,
    });

    expect(created.isOk() && created._unsafeUnwrap()).toEqual({
      id: ORG,
      name: 'Renamed',
      createdAt: NOW,
    });
    const row = await db.execute({
      sql: `SELECT name, created_at AS createdAt, time_zone AS timeZone,
              notes_mirror_bot_user_id AS mirror
            FROM organizations WHERE id = ?`,
      args: [ORG],
    });
    expect(row.rows[0]).toEqual({
      name: 'Renamed',
      createdAt: '2024-01-01T00:00:00.000Z',
      timeZone: 'Pacific/Auckland',
      mirror: MIRROR,
    });
  });
});
