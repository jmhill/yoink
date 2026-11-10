import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeIdGenerator } from '@yoink/infrastructure';
import { okAsync } from 'neverthrow';
import type { Actor } from '../kernel/auth-context.js';
import type { Policy, UnitOfWork } from '../kernel/unit-of-work.js';
import { openDatabase } from '../platform/database/database.js';
import { migrations } from '../platform/database/migrations/index.js';
import { runMigrations } from '../platform/database/migrator.js';
import { createSqliteUnitOfWork } from '../platform/unit-of-work/sqlite-unit-of-work.js';
import { createHistoryEventSink } from '../modules/history/application/prepare-event-sink.js';
import { CAPTURE_TIMELINE_BUILDERS } from '../modules/history/domain/capture-timeline.js';
import { TASK_TIMELINE_BUILDERS } from '../modules/history/domain/task-timeline.js';
import { historySqlParticipant } from '../modules/history/infrastructure/sqlite-event-sink.js';
import { createCaptures } from '../modules/captures/index.js';
import { capturesSqlParticipant } from '../modules/captures/infrastructure/persistence/capture-sql-participant.js';
import {
  countTrashedCaptures,
  createSqliteCaptureStore,
} from '../modules/captures/infrastructure/persistence/sqlite-capture-store.js';
import { createTaskManagement } from '../modules/task-management/index.js';
import { taskManagementSqlParticipant } from '../modules/task-management/infrastructure/persistence/task-management-sql-participant.js';
import { createSqliteProjectStore } from '../modules/task-management/infrastructure/persistence/sqlite-project-store.js';
import { createSqliteTaskStore } from '../modules/task-management/infrastructure/persistence/sqlite-task-store.js';
import {
  createProcessingHandlers,
  deleteSourceCapturePolicy,
} from '../workflows/processing/index.js';
import {
  mapProcessToProjectCommit,
  mapProcessToTaskCommit,
} from '../workflows/processing/application/map-commit-failure.js';
import { toProjectStarter } from '../workflows/processing/domain/to-project-starter.js';
import { toTaskStarter } from '../workflows/processing/domain/to-task-starter.js';
import type { Database } from '../platform/database/types.js';

const now = '2026-11-10T12:00:00.000Z';
const actor: Actor = { kind: 'user', userId: 'user-1', via: 'session' };
const taskCaptureId = '11111111-1111-4111-8111-111111111111';
const projectCaptureId = '22222222-2222-4222-8222-222222222222';
const racedTaskCaptureId = '33333333-3333-4333-8333-333333333333';
const racedProjectCaptureId = '44444444-4444-4444-8444-444444444444';
const goneCaptureId = '55555555-5555-4555-8555-555555555555';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const countOf = async (database: Database, table: 'tasks' | 'projects'): Promise<number> => {
  const counted = await database.execute({
    sql: `SELECT COUNT(*) AS n FROM ${table}`,
  });
  return Number(counted.rows[0]?.n);
};

const openProcessing = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'processing-uow-'));
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
  const ids = createFakeIdGenerator();
  const policies: Policy[] = [];
  const unitOfWork = createSqliteUnitOfWork({
    client: opened.writeClient,
    participants: [historySqlParticipant, capturesSqlParticipant, taskManagementSqlParticipant],
    policies,
    sink: createHistoryEventSink({
      ids,
      builders: { ...CAPTURE_TIMELINE_BUILDERS, ...TASK_TIMELINE_BUILDERS },
    }),
  });
  const captureStore = await createSqliteCaptureStore(opened.database, {
    now: () => new Date(now),
  });
  const captures = createCaptures({
    load: (id) => captureStore.findById(id),
    list: (options) => captureStore.findByOrganization(options),
    countTrashed: (organizationId) => countTrashedCaptures(opened.database, organizationId),
    uow: unitOfWork,
    ids,
    now: () => now,
  });
  policies.push(deleteSourceCapturePolicy(captures));
  const taskStore = await createSqliteTaskStore(opened.database);
  const projectStore = await createSqliteProjectStore(opened.database);
  const taskManagement = managementFor({
    unitOfWork,
    ids,
    taskStore,
    projectStore,
  });
  const processing = createProcessingHandlers({
    captures,
    taskManagement,
    uow: unitOfWork,
    logger: { info() { return undefined; } },
  });
  return { ...opened, captures, taskManagement, processing, taskStore, unitOfWork };
};

const insertCapture = async (database: Database, id: string, content: string) => {
  await database.execute({
    sql: `
      INSERT INTO captures (id, organization_id, created_by_id, content, status, captured_at)
      VALUES (?, ?, ?, ?, 'inbox', ?)
    `,
    args: [id, 'org-1', 'user-1', content, now],
  });
};

const managementFor = (opened: {
  unitOfWork: UnitOfWork;
  ids: { generate: () => string };
  taskStore: Awaited<ReturnType<typeof createSqliteTaskStore>>;
  projectStore: Awaited<ReturnType<typeof createSqliteProjectStore>>;
}) =>
  createTaskManagement({
    uow: opened.unitOfWork,
    logger: { info() { return undefined; } },
    nextId: () => opened.ids.generate(),
    now: () => now,
    viewerNow: () => new Date(now),
    principalLookup: { existsInOrganization: () => okAsync(true) },
    listNamedLists: () => okAsync([]),
    pageNamedLists: () => okAsync({ rows: [], total: 0 }),
    loadNamedList: () => okAsync(null),
    countOpenOnList: () => okAsync(0),
    loadOpenTasksOnList: () =>
      opened.taskStore.findOpenInPile({ organizationId: 'org-1', listId: null }),
    pageOpenTasksOnList: (options) => opened.taskStore.pageOpenInPile(options),
    loadListTasksByIds: (ids) => opened.taskStore.findByIds(ids),
    loadOpenInPile: (organizationId, listId) =>
      opened.taskStore.findOpenInPile({ organizationId, listId }),
    list: (options) => opened.taskStore.findByOrganization(options),
    persistStage: () => okAsync(undefined),
    loadImport: () => okAsync(null),
    listPendingImports: () => okAsync([]),
    loadTasksByIds: (ids) => opened.taskStore.findByIds(ids),
    loadListsByIds: () => okAsync([]),
    loadMemberIds: () => okAsync(new Set<string>()),
    loadUserName: () => okAsync('Lane'),
    listProjects: (organizationId) => opened.projectStore.findByOrganization(organizationId),
    pageProjects: (options) => opened.projectStore.pageByOrganization(options),
    loadProject: (id) => opened.projectStore.findById(id),
    loadTask: (id) => opened.taskStore.findById(id),
    loadNextOpenOrder: (organizationId, listId) =>
      opened.taskStore.nextOpenOrderInPile({ organizationId, listId }),
    pageOpenTasksOnProject: (options) => opened.taskStore.pageOpenInProject(options),
    pageNextActions: () => okAsync({ rows: [], total: 0 }),
    pageDue: () => okAsync({ rows: [], total: 0 }),
    pageLists: () => okAsync({ rows: [], total: 0 }),
    countUnlistedOpen: () => okAsync(0),
  });

describe('processing inbox guard', () => {
  it('processes a capture once and refuses the second attempt before another insert', async () => {
    const opened = await openProcessing();
    try {
      await insertCapture(opened.database, taskCaptureId, 'Buy milk');
      const command = {
        id: taskCaptureId,
        organizationId: 'org-1',
        createdById: 'user-1',
        actor,
      };
      const first = await opened.processing.processCaptureToTask(command);
      expect(first.isOk()).toBe(true);
      const second = await opened.processing.processCaptureToTask(command);
      expect(second._unsafeUnwrapErr()).toEqual({
        type: 'CAPTURE_NOT_IN_INBOX',
        captureId: taskCaptureId,
      });
      expect(await countOf(opened.database, 'tasks')).toBe(1);
    } finally {
      opened.client.close();
    }
  });

  it('rolls back the task insert when the inbox guard misses', async () => {
    const opened = await openProcessing();
    try {
      await insertCapture(opened.database, racedTaskCaptureId, 'Buy milk');
      const capture = (
        await opened.captures.queries.findInboxCapture(racedTaskCaptureId, 'org-1')
      )._unsafeUnwrap();
      const taskWork = (
        await opened.taskManagement.prepare.createTask(
          toTaskStarter(
            {
              id: racedTaskCaptureId,
              organizationId: 'org-1',
              createdById: 'user-1',
              actor,
            },
            capture
          ),
          actor
        )
      )._unsafeUnwrap();
      const claimWork = (
        await opened.captures.prepare.markProcessed({
          captureId: capture.id,
          organizationId: 'org-1',
          to: { kind: 'task', id: taskWork.result.view.id },
          actor,
        })
      )._unsafeUnwrap();
      await opened.database.execute({
        sql: `UPDATE captures SET status = 'trashed' WHERE id = ?`,
        args: [racedTaskCaptureId],
      });

      const raced = await opened.unitOfWork.commit([claimWork, taskWork]);
      expect(raced.isErr()).toBe(true);
      if (raced.isErr()) {
        expect(mapProcessToTaskCommit(raced.error, racedTaskCaptureId)).toEqual({
          type: 'CAPTURE_NOT_IN_INBOX',
          captureId: racedTaskCaptureId,
        });
      }
      expect(await countOf(opened.database, 'tasks')).toBe(0);
      const status = await opened.database.execute({
        sql: `SELECT status FROM captures WHERE id = ?`,
        args: [racedTaskCaptureId],
      });
      expect(status.rows[0]?.status).toBe('trashed');
    } finally {
      opened.client.close();
    }
  });

  it('rolls back the project insert when the inbox guard misses and keeps captureId on a real create', async () => {
    const opened = await openProcessing();
    try {
      await insertCapture(opened.database, projectCaptureId, 'Harbor notes');
      const created = await opened.processing.processCaptureToProject({
        id: projectCaptureId,
        organizationId: 'org-1',
        createdById: 'user-1',
        name: 'Harbor',
        status: 'active',
        actor,
      });
      expect(created.isOk()).toBe(true);
      const stored = await opened.database.execute({
        sql: `SELECT payload_json FROM change_log WHERE kind = 'ProjectCreated'`,
      });
      const payload = JSON.parse(String(stored.rows[0]?.payload_json)) as { captureId?: string };
      expect(payload.captureId).toBe(projectCaptureId);

      await insertCapture(opened.database, racedProjectCaptureId, 'Other notes');
      const capture = (
        await opened.captures.queries.findInboxCapture(racedProjectCaptureId, 'org-1')
      )._unsafeUnwrap();
      const projectWork = (
        await opened.taskManagement.prepare.createProject(
          toProjectStarter(
            {
              id: racedProjectCaptureId,
              organizationId: 'org-1',
              createdById: 'user-1',
              name: 'Pier',
              status: 'someday',
              actor,
            },
            capture
          ),
          actor
        )
      )._unsafeUnwrap();
      const claimWork = (
        await opened.captures.prepare.markProcessed({
          captureId: capture.id,
          organizationId: 'org-1',
          to: { kind: 'project', id: projectWork.result.view.id },
          actor,
        })
      )._unsafeUnwrap();
      await opened.database.execute({
        sql: `UPDATE captures SET status = 'trashed' WHERE id = ?`,
        args: [racedProjectCaptureId],
      });
      const raced = await opened.unitOfWork.commit([claimWork, projectWork]);
      expect(raced.isErr()).toBe(true);
      if (raced.isErr()) {
        expect(
          mapProcessToProjectCommit(raced.error, {
            captureId: racedProjectCaptureId,
            projectName: projectWork.result.view.name,
          }).type
        ).toBe('CAPTURE_NOT_IN_INBOX');
      }
      expect(await countOf(opened.database, 'projects')).toBe(1);
    } finally {
      opened.client.close();
    }
  });

  it('soft-deletes the source capture in the same commit as the task delete', async () => {
    const opened = await openProcessing();
    try {
      await insertCapture(opened.database, taskCaptureId, 'Buy milk');
      const processed = await opened.processing.processCaptureToTask({
        id: taskCaptureId,
        organizationId: 'org-1',
        createdById: 'user-1',
        actor,
      });
      const task = processed._unsafeUnwrap();
      const deleted = await opened.taskManagement.commands.deleteTask({
        id: task.id,
        organizationId: 'org-1',
        actor,
      });
      expect(deleted.isOk()).toBe(true);
      expect((await opened.taskStore.findById(task.id))._unsafeUnwrap()).toBeNull();
      expect(
        (await opened.captures.queries.findInboxCapture(taskCaptureId, 'org-1')).isErr()
      ).toBe(true);
      const capture = await opened.database.execute({
        sql: `SELECT deleted_at FROM captures WHERE id = ?`,
        args: [taskCaptureId],
      });
      expect(capture.rows[0]?.deleted_at).toBe(now);
    } finally {
      opened.client.close();
    }
  });

  it('still deletes a task whose source capture is already gone', async () => {
    const opened = await openProcessing();
    try {
      await insertCapture(opened.database, goneCaptureId, 'Gone');
      await opened.database.execute({
        sql: `UPDATE captures SET deleted_at = ? WHERE id = ?`,
        args: [now, goneCaptureId],
      });
      await opened.database.execute({
        sql: `
          INSERT INTO tasks (
            id, organization_id, created_by_id, title, capture_id, open_order, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?)
        `,
        args: ['task-gone', 'org-1', 'user-1', 'Already gone', goneCaptureId, now],
      });
      const deleted = await opened.taskManagement.commands.deleteTask({
        id: 'task-gone',
        organizationId: 'org-1',
        actor,
      });
      expect(deleted.isOk()).toBe(true);
      expect((await opened.taskStore.findById('task-gone'))._unsafeUnwrap()).toBeNull();
    } finally {
      opened.client.close();
    }
  });
});
