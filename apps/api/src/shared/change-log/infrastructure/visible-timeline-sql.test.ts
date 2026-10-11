import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../../../database/test-utils.js';
import type { Database } from '../../../database/types.js';
import { taskUpdatedShowsOnTimeline } from '../domain/to-timeline-entry.js';
import type { TaskUpdatedPayloadV1 } from '../domain/payloads.js';
import { VISIBLE_TIMELINE_SQL } from './sql.js';

const now = '2026-10-11T15:00:00.000Z';

const insertRow = async (
  db: Database,
  input: {
    id: string;
    kind: string;
    payload: string;
    hidden?: number;
    seq: number;
  }
) => {
  await db.execute({
    sql: `
      INSERT INTO change_log (
        id, organization_id, project_id, subject_type, subject_id,
        kind, schema_version, payload_json, actor_user_id, actor_kind,
        occurred_at, hidden, seq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      input.id,
      'org-1',
      'project-1',
      'task',
      'task-1',
      input.kind,
      1,
      input.payload,
      null,
      null,
      now,
      input.hidden ?? 0,
      input.seq,
    ],
  });
};

describe('VISIBLE_TIMELINE_SQL agrees with taskUpdatedShowsOnTimeline', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', now],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  const visibleIds = async (): Promise<string[]> => {
    const result = await db.execute({
      sql: `SELECT id FROM change_log WHERE ${VISIBLE_TIMELINE_SQL} ORDER BY seq ASC`,
    });
    return result.rows.map((row) => String(row.id));
  };

  it('keeps title/due/owner/list edits and drops projectId/openOrder-only updates', async () => {
    const cases: Array<{ id: string; payload: TaskUpdatedPayloadV1 }> = [
      { id: 'title', payload: { title: 'New' } },
      { id: 'due-cleared', payload: { dueDate: null } },
      { id: 'owner', payload: { assigneeId: 'u2' } },
      { id: 'list', payload: { listId: 'l1' } },
      { id: 'project-only', payload: { projectId: 'p2' } },
      { id: 'order-only', payload: { openOrder: 3 } },
      { id: 'project-and-order', payload: { projectId: 'p2', openOrder: 3 } },
      { id: 'title-and-move', payload: { title: 'New', projectId: 'p2' } },
    ];

    for (const [index, item] of cases.entries()) {
      await insertRow(db, {
        id: item.id,
        kind: 'TaskUpdated',
        payload: JSON.stringify(item.payload),
        seq: index + 1,
      });
    }

    const expected = cases
      .filter((item) => taskUpdatedShowsOnTimeline(item.payload))
      .map((item) => item.id);
    expect(expected).toEqual(['title', 'due-cleared', 'owner', 'list', 'title-and-move']);
    expect(await visibleIds()).toEqual(expected);
  });

  it('lets damaged JSON through so the read can render Unknown', async () => {
    await insertRow(db, {
      id: 'damaged',
      kind: 'TaskUpdated',
      payload: '{not-json',
      seq: 1,
    });
    expect(await visibleIds()).toEqual(['damaged']);
  });

  it('still hides rows marked hidden', async () => {
    await insertRow(db, {
      id: 'pinned',
      kind: 'TaskPinned',
      payload: JSON.stringify({ pinnedAt: now }),
      hidden: 1,
      seq: 1,
    });
    expect(await visibleIds()).toEqual([]);
  });
});
