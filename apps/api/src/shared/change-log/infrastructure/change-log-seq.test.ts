import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../../../database/test-utils.js';
import type { Database } from '../../../database/types.js';
import type { ChangeLogRecord } from '../domain/record.js';
import { insertChangeLogIfChangedQuery, insertChangeLogQuery } from './sql.js';
import { createSqliteChangeLogStore } from './sqlite-change-log-store.js';

const now = '2026-10-11T15:00:00.000Z';
const sameInstant = '2026-10-11T16:00:00.000Z';

const projectUpdated = (id: string, occurredAt: string): ChangeLogRecord => ({
  id,
  organizationId: 'org-1',
  projectId: 'project-1',
  subjectType: 'project',
  subjectId: 'project-1',
  kind: 'ProjectUpdated',
  schemaVersion: 1,
  hidden: false,
  payload: { name: 'Garden' },
  actorUserId: 'user-1',
  actorKind: 'user',
  occurredAt,
});

describe('change_log seq with real UUIDs', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', now],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'owner@example.com', now],
    });
    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', now],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('assigns monotonic seq so same occurred_at sorts by write order, not UUID', async () => {
    const firstId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const secondId = '00000000-0000-4000-8000-000000000001';

    await db.execute(insertChangeLogQuery(projectUpdated(firstId, sameInstant)));
    await db.execute(insertChangeLogQuery(projectUpdated(secondId, sameInstant)));

    const rows = await db.execute({
      sql: `SELECT id, seq FROM change_log ORDER BY seq ASC`,
    });
    expect(rows.rows.map((row) => ({ id: row.id, seq: Number(row.seq) }))).toEqual([
      { id: firstId, seq: 1 },
      { id: secondId, seq: 2 },
    ]);

    const store = createSqliteChangeLogStore(db);
    const page = await store.pageVisibleForProject({
      organizationId: 'org-1',
      projectId: 'project-1',
      fetchLimit: 10,
    });
    expect(page.isOk()).toBe(true);
    if (page.isOk()) {
      expect(page.value.rows.map((item) => item.record.id)).toEqual([secondId, firstId]);
      expect(page.value.rows.map((item) => item.seq)).toEqual([2, 1]);
    }
  });

  it('keeps seq after VACUUM so rowid churn cannot reorder the timeline', async () => {
    const firstId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await db.execute(insertChangeLogQuery(projectUpdated(firstId, sameInstant)));
    await db.execute(insertChangeLogQuery(projectUpdated(secondId, sameInstant)));

    await db.execute({ sql: 'VACUUM' });

    const rows = await db.execute({
      sql: `SELECT id, seq FROM change_log ORDER BY seq ASC`,
    });
    expect(rows.rows.map((row) => row.id)).toEqual([firstId, secondId]);
  });

  it('skips insertChangeLogIfChangedQuery when the previous statement changed 0 rows', async () => {
    const skipped = projectUpdated('cccccccc-cccc-4ccc-8ccc-cccccccccccc', sameInstant);
    const written = projectUpdated('dddddddd-dddd-4ddd-8ddd-dddddddddddd', sameInstant);

    await db.batch(
      [
        {
          sql: `UPDATE projects SET name = name WHERE id = ? AND 1 = 0`,
          args: ['project-1'],
        },
        insertChangeLogIfChangedQuery(skipped),
      ],
      'write'
    );

    const afterSkip = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM change_log`,
    });
    expect(Number(afterSkip.rows[0]?.n)).toBe(0);

    await db.batch(
      [
        {
          sql: `UPDATE projects SET name = ? WHERE id = ?`,
          args: ['Backyard', 'project-1'],
        },
        insertChangeLogIfChangedQuery(written),
      ],
      'write'
    );

    const afterWrite = await db.execute({
      sql: `SELECT id, seq FROM change_log`,
    });
    expect(afterWrite.rows.map((row) => ({ id: row.id, seq: Number(row.seq) }))).toEqual([
      { id: written.id, seq: 1 },
    ]);
  });
});
