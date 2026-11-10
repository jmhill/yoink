import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { okAsync } from 'neverthrow';
import { createFakeIdGenerator } from '@yoink/infrastructure';
import type { Actor } from '../../../../kernel/auth-context.js';
import { openDatabase } from '../../../../platform/database/database.js';
import { migrations } from '../../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../../platform/database/migrator.js';
import { createSqliteUnitOfWork } from '../../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createHistoryEventSink } from '../../../history/application/prepare-event-sink.js';
import { TASK_TIMELINE_BUILDERS } from '../../../history/domain/task-timeline.js';
import { historySqlParticipant } from '../../../history/infrastructure/sqlite-event-sink.js';
import { handleChangeProjectStatus } from '../../application/handlers/handle-change-project-status.js';
import { createTaskManagement } from '../../application/create-task-management.js';
import {
  createUowImportDiscard,
  createUowImportPersist,
  createUowProjectPersist,
  createUowProjectStatusPersist,
} from '../../application/support/commit-task-management.js';
import { storageError } from '../../domain/messages/project-errors.js';
import { planProjectChange } from '../../domain/projections/plan-project-change.js';
import { planTaskChange } from '../../domain/projections/plan-task-change.js';
import { taskManagementSqlParticipant } from './task-management-sql-participant.js';
import { createSqliteProjectStore } from './sqlite-project-store.js';
import { createSqliteTaskStore } from './sqlite-task-store.js';
import type { Database } from '../../../../platform/database/types.js';
import type { UnitOfWork } from '../../../../kernel/unit-of-work.js';
import type { TaskManagement } from '../../application/create-task-management.js';

const now = '2026-11-09T12:00:00.000Z';
const later = '2026-11-09T13:00:00.000Z';
const actor: Actor = { kind: 'user', userId: 'user-1', via: 'session' };

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const openFileDatabase = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'task-uow-'));
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
  const unitOfWork = createSqliteUnitOfWork({
    client: opened.writeClient,
    participants: [historySqlParticipant, taskManagementSqlParticipant],
    sink: createHistoryEventSink({ ids, builders: TASK_TIMELINE_BUILDERS }),
  });
  const taskStore = await createSqliteTaskStore(opened.database);
  const projectStore = await createSqliteProjectStore(opened.database);
  return { ...opened, ids, unitOfWork, taskStore, projectStore };
};

const projectCreated = (id: string, name: string) =>
  planProjectChange({
    event: {
      type: 'ProjectCreated',
      id,
      organizationId: 'org-1',
      createdById: 'user-1',
      name,
      status: 'active',
      createdAt: now,
      occurredAt: now,
    },
    current: null,
    actor,
    ids: { recordId: `log-${id}` },
  });

const kinds = async (database: Database): Promise<string[]> => {
  const stored = await database.execute({
    sql: `SELECT kind FROM change_log ORDER BY seq`,
  });
  return stored.rows.map((row) => String(row.kind));
};

describe('task management unit of work', () => {
  it('completes 1000 open tasks in one commit when a project is marked done', async () => {
    const opened = await openFileDatabase();
    try {
      await opened.database.execute({
        sql: `
          INSERT INTO projects (
            id, organization_id, created_by_id, name, status, notebook_pages, created_at
          ) VALUES (?, ?, ?, ?, 'active', '[]', ?)
        `,
        args: ['project-1', 'org-1', 'user-1', 'Garden', now],
      });
      await opened.database.batch(
        Array.from({ length: 1000 }, (_, index) => ({
          sql: `
            INSERT INTO tasks (
              id, organization_id, created_by_id, title, project_id, open_order, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            `task-${index}`,
            'org-1',
            'user-1',
            `Task ${index}`,
            'project-1',
            index,
            now,
          ],
        })),
        'write'
      );

      const result = await handleChangeProjectStatus(
        {
          id: 'project-1',
          organizationId: 'org-1',
          status: 'done',
          openTasks: 'complete',
          actor,
        },
        {
          load: (id) => opened.projectStore.findById(id),
          pageOpenTasksOnProject: (options) => opened.taskStore.pageOpenInProject(options),
          persistStatus: (input) =>
            createUowProjectStatusPersist(opened.unitOfWork)(input).mapErr((error) =>
              error.type === 'PROJECT_DONE' ? storageError(error.message) : error
            ),
          nextId: () => opened.ids.generate(),
          now: () => later,
        }
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        return;
      }
      expect(result.value.completedTaskCount).toBe(1000);
      const remaining = await opened.database.execute({
        sql: `
          SELECT COUNT(*) AS open_count FROM tasks
          WHERE project_id = ? AND completed_at IS NULL AND deleted_at IS NULL
        `,
        args: ['project-1'],
      });
      expect(Number(remaining.rows[0]?.open_count)).toBe(0);
      const completed = await opened.database.execute({
        sql: `SELECT COUNT(*) AS done_count FROM change_log WHERE kind = 'TaskCompleted'`,
      });
      expect(Number(completed.rows[0]?.done_count)).toBe(1000);
      expect(await kinds(opened.database)).toContain('ProjectStatusChanged');
    } finally {
      opened.client.close();
    }
  });

  it('does not create a new task when the project is marked done between load and save', async () => {
    const opened = await openFileDatabase();
    try {
      const persist = createUowProjectPersist(opened.unitOfWork);
      const persistStatus = createUowProjectStatusPersist(opened.unitOfWork);
      const created = projectCreated('project-1', 'Garden');
      expect((await persist(created)).isOk()).toBe(true);

      await opened.database.execute({
        sql: `UPDATE projects SET status = 'done' WHERE id = ?`,
        args: ['project-1'],
      });

      const result = await persistStatus({
        project: planProjectChange({
          event: {
            type: 'ProjectNextActionSet',
            id: 'project-1',
            organizationId: 'org-1',
            taskId: 'task-new',
            previousTaskId: null,
            occurredAt: later,
          },
          current: created.view,
          actor,
          ids: { recordId: 'log-raced-new-task' },
        }),
        tasks: [
          planTaskChange({
            event: {
              type: 'TaskCreated',
              id: 'task-new',
              organizationId: 'org-1',
              createdById: 'user-1',
              title: 'Order lumber',
              projectId: 'project-1',
              openOrder: 0,
              createdAt: later,
              occurredAt: later,
            },
            current: null,
            actor,
            ids: { recordId: 'log-task-new' },
          }),
        ],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('PROJECT_DONE');
      }
      const task = await opened.database.execute({
        sql: `SELECT id FROM tasks WHERE id = ?`,
        args: ['task-new'],
      });
      expect(task.rows).toEqual([]);
      expect(await kinds(opened.database)).toEqual(['ProjectCreated']);
    } finally {
      opened.client.close();
    }
  });

  it('reports duplicate project names and imports that are not pending', async () => {
    const opened = await openFileDatabase();
    try {
      const garden = projectCreated('project-1', 'Garden');
      expect((await createUowProjectPersist(opened.unitOfWork)(garden)).isOk()).toBe(true);
      await opened.database.execute({
        sql: `
          INSERT INTO project_imports (
            id, organization_id, created_by, created_at, status, payload_json
          ) VALUES (?, ?, ?, ?, 'pending', '{}')
        `,
        args: ['import-1', 'org-1', 'user-1', now],
      });
      const imported = projectCreated('project-2', 'Garden');
      const apply = await createUowImportPersist(opened.unitOfWork)({
        write: {
          organizationId: 'org-1',
          projects: [imported.view],
          importRecords: imported.records,
          tasks: [],
        },
        stagedImportId: 'import-1',
        decidedById: 'user-1',
        decidedAt: later,
      });
      expect(apply.isErr()).toBe(true);
      if (apply.isErr()) {
        expect(apply.error.type).toBe('DUPLICATE_PROJECT_NAME');
      }
      const pending = await opened.database.execute({
        sql: `SELECT status FROM project_imports WHERE id = ?`,
        args: ['import-1'],
      });
      expect(pending.rows[0]?.status).toBe('pending');

      await opened.database.execute({
        sql: `UPDATE project_imports SET status = 'applied' WHERE id = ?`,
        args: ['import-1'],
      });
      const discard = await createUowImportDiscard(opened.unitOfWork)({
        id: 'import-1',
        organizationId: 'org-1',
        decidedById: 'user-1',
        decidedAt: later,
      });
      expect(discard.isErr()).toBe(true);
      if (discard.isErr()) {
        expect(discard.error.type).toBe('IMPORT_NOT_PENDING');
      }
    } finally {
      opened.client.close();
    }
  });

  it('commits prepare.createTask later, and stores TaskDeleted as captureId', async () => {
    const opened = await openFileDatabase();
    try {
      const management = managementFor(opened);
      await opened.database.execute({
        sql: `
          INSERT INTO captures (
            id, organization_id, created_by_id, content, status, captured_at
          ) VALUES (?, ?, ?, ?, 'inbox', ?)
        `,
        args: ['cap-1', 'org-1', 'user-1', 'From the inbox', now],
      });
      const prepared = await management.prepare.createTask(
        {
          title: 'Nail the trellis',
          organizationId: 'org-1',
          createdById: 'user-1',
          captureId: 'cap-1',
        },
        actor
      );
      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) {
        return;
      }
      expect((await opened.unitOfWork.commit([prepared.value])).isOk()).toBe(true);
      const taskId = prepared.value.result.view.id;
      const deleted = await management.commands.deleteTask({
        id: taskId,
        organizationId: 'org-1',
        actor,
      });
      expect(deleted.isOk()).toBe(true);
      const stored = await opened.database.execute({
        sql: `SELECT payload_json FROM change_log WHERE kind = 'TaskDeleted'`,
      });
      expect(stored.rows).toEqual([{ payload_json: JSON.stringify({ captureId: 'cap-1' }) }]);
    } finally {
      opened.client.close();
    }
  });

  it('writes a next-action clear only when the update changes the row', async () => {
    const opened = await openFileDatabase();
    try {
      await opened.database.execute({
        sql: `
          INSERT INTO projects (
            id, organization_id, created_by_id, name, status, notebook_pages, created_at,
            next_action_task_id
          ) VALUES (?, ?, ?, ?, 'active', '[]', ?, NULL)
        `,
        args: ['project-1', 'org-1', 'user-1', 'Garden', now],
      });
      await opened.database.execute({
        sql: `
          INSERT INTO tasks (
            id, organization_id, created_by_id, title, project_id, open_order, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?)
        `,
        args: ['task-1', 'org-1', 'user-1', 'Water', 'project-1', now],
      });
      await opened.database.execute({
        sql: `UPDATE projects SET next_action_task_id = ? WHERE id = ?`,
        args: ['task-1', 'project-1'],
      });
      const management = managementFor(opened);
      const completed = await management.commands.completeTask({
        id: 'task-1',
        organizationId: 'org-1',
        actor,
      });
      expect(completed.isOk()).toBe(true);
      expect(await kinds(opened.database)).toEqual(
        expect.arrayContaining(['TaskCompleted', 'ProjectNextActionCleared'])
      );
      const before = (await kinds(opened.database)).length;
      await opened.database.execute({
        sql: `
          INSERT INTO tasks (
            id, organization_id, created_by_id, title, project_id, open_order, created_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?)
        `,
        args: ['task-2', 'org-1', 'user-1', 'Weed', 'project-1', now],
      });
      const second = await management.commands.completeTask({
        id: 'task-2',
        organizationId: 'org-1',
        actor,
      });
      expect(second.isOk()).toBe(true);
      const after = await kinds(opened.database);
      expect(after.filter((kind) => kind === 'ProjectNextActionCleared')).toHaveLength(1);
      expect(after).toHaveLength(before + 1);
    } finally {
      opened.client.close();
    }
  });
});

const managementFor = (opened: {
  database: Database;
  unitOfWork: UnitOfWork;
  ids: { generate: () => string };
  taskStore: Awaited<ReturnType<typeof createSqliteTaskStore>>;
  projectStore: Awaited<ReturnType<typeof createSqliteProjectStore>>;
}): TaskManagement => {
  return createTaskManagement({
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
    loadOpenTasksOnList: () => opened.taskStore.findOpenInPile({ organizationId: 'org-1', listId: null }),
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
};
