import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Capture } from '@yoink/api-contracts';
import type { Actor } from '../kernel/auth-context.js';
import { openDatabase } from '../platform/database/database.js';
import { migrations } from '../platform/database/migrations/index.js';
import { runMigrations } from '../platform/database/migrator.js';
import { createSqliteUnitOfWork } from '../platform/unit-of-work/sqlite-unit-of-work.js';
import { captureProcessedIntegrationEvent } from '../modules/captures/application/integration-events/to-capture-integration-event.js';
import { createCaptures } from '../modules/captures/application/create-captures.js';
import { captureWork } from '../modules/captures/application/support/commit-capture.js';
import { planCaptureUpdate, planMarkProcessed } from '../modules/captures/domain/projections/plan-capture.js';
import { createHistoryEventSink } from '../modules/history/application/prepare-event-sink.js';
import { CAPTURE_TIMELINE_BUILDERS } from '../modules/history/domain/capture-timeline.js';
import { historySqlParticipant } from '../modules/history/infrastructure/sqlite-event-sink.js';
import { VISIBLE_TIMELINE_SQL } from '../modules/history/infrastructure/sql.js';
import { capturesSqlParticipant } from '../modules/captures/infrastructure/persistence/capture-sql-participant.js';
import { countTrashedCaptures, createSqliteCaptureStore } from '../modules/captures/infrastructure/persistence/sqlite-capture-store.js';

const now = '2026-11-07T15:00:00.000Z';
const actor: Actor = { kind: 'user', userId: 'user-1', via: 'session' };

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const openFileDatabase = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'capture-uow-'));
  directories.push(dir);
  const opened = openDatabase({ type: 'file', path: join(dir, 'yoink.db') });
  await runMigrations(opened.database, migrations);
  await opened.database.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: ['org-1', 'Org', now],
  });
  await opened.database.execute({
    sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
    args: ['user-1', 'lane@example.com', now],
  });
  const clock = createFakeClock(new Date(now));
  const store = await createSqliteCaptureStore(opened.database, clock);
  const ids = createFakeIdGenerator();
  const unitOfWork = createSqliteUnitOfWork({
    client: opened.writeClient,
    participants: [historySqlParticipant, capturesSqlParticipant],
    sink: createHistoryEventSink({ ids, builders: CAPTURE_TIMELINE_BUILDERS }),
  });
  const captures = createCaptures({
    load: (id) => store.findById(id),
    list: (options) => store.findByOrganization(options),
    countTrashed: (organizationId) => countTrashedCaptures(opened.database, organizationId),
    uow: unitOfWork,
    ids,
    now: () => now,
  });
  return { ...opened, captures, unitOfWork };
};

describe('capture integration events', () => {
  it('round-trips into change_log as subject capture and stays off the visible timeline', async () => {
    const { database, client, captures } = await openFileDatabase();
    const created = await captures.commands.createCapture({
      content: 'Hello',
      organizationId: 'org-1',
      createdById: 'user-1',
      actor,
    });

    expect(created.isOk()).toBe(true);
    const stored = await database.execute({
      sql: `SELECT subject_type, kind, payload_json FROM change_log`,
    });
    expect(stored.rows).toEqual([
      {
        subject_type: 'capture',
        kind: 'CaptureCreated',
        payload_json: JSON.stringify({ content: 'Hello' }),
      },
    ]);
    const visible = await database.execute({
      sql: `SELECT id FROM change_log WHERE ${VISIBLE_TIMELINE_SQL}`,
    });
    expect(visible.rows).toEqual([]);
    client.close();
  });

  it('rolls the capture write and the history row back when the inbox guard misses', async () => {
    const { database, client, unitOfWork } = await openFileDatabase();
    await database.execute({
      sql: `
        INSERT INTO captures (
          id, organization_id, created_by_id, content, status, captured_at
        ) VALUES (?, ?, ?, ?, 'trashed', ?)
      `,
      args: ['cap-trashed', 'org-1', 'user-1', 'Old', now],
    });
    const current: Capture = {
      id: 'cap-trashed',
      organizationId: 'org-1',
      createdById: 'user-1',
      content: 'Changed',
      status: 'trashed',
      capturedAt: now,
    };
    const committed = await unitOfWork.commit([
      captureWork({
        result: null,
        plan: {
          writes: [
            ...planCaptureUpdate(current).writes,
            ...planMarkProcessed({
              id: 'cap-trashed',
              organizationId: 'org-1',
              processedAt: now,
              processedToType: 'task',
              processedToId: 'task-1',
            }).writes,
          ],
        },
        event: captureProcessedIntegrationEvent({
          id: 'event-1',
          captureId: 'cap-trashed',
          organizationId: 'org-1',
          occurredAt: now,
          actor,
          processedToType: 'task',
          processedToId: 'task-1',
        }),
      }),
    ]);

    expect(committed.isErr()).toBe(true);
    if (committed.isErr()) {
      expect(committed.error).toEqual({
        kind: 'Conflict',
        owner: 'captures',
        reason: 'guard-miss',
      });
    }
    const capture = await database.execute({
      sql: `SELECT content, status FROM captures WHERE id = ?`,
      args: ['cap-trashed'],
    });
    expect(capture.rows).toEqual([{ content: 'Old', status: 'trashed' }]);
    const history = await database.execute({ sql: `SELECT COUNT(*) AS n FROM change_log` });
    expect(Number(history.rows[0]?.n)).toBe(0);
    client.close();
  });
});
