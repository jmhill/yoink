import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { errAsync } from 'neverthrow';
import type { ImportProject, Task } from '@yoink/api-contracts';
import { createTestDatabase } from '../../database/test-utils.js';
import type { Database } from '../../database/types.js';
import { createSqliteTaskPersist } from '../../tasks/infrastructure/store-backed-persist.js';
import { createSqliteTaskStore } from '../../tasks/infrastructure/sqlite-task-store.js';
import { planTaskChange } from '../../tasks/domain/plan-task-change.js';
import { createSqliteChangeLogStore } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';
import { createFakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import { createFakeTaskStore } from '../../tasks/infrastructure/fake-task-store.js';
import { decideImport } from '../domain/decide-import.js';
import { planImport } from '../domain/plan-project-import.js';
import { createSqliteProjectStore } from './sqlite-project-store.js';
import { createFakeProjectStore } from './fake-project-store.js';
import { createFakeImportStore } from './fake-import-store.js';
import { createSqliteImportStore } from './sqlite-import-store.js';
import {
  createSqliteImportPersist,
  createStoreBackedImportPersist,
} from './store-backed-persist.js';

const now = '2026-10-11T15:00:00.000Z';
const person = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };

const paint: Task = {
  id: 'task-paint',
  organizationId: 'org-1',
  createdById: 'user-1',
  title: 'Paint the door',
  createdAt: now,
  lastChangedAt: now,
  lastChangedBy: 'user-1',
  completedBy: null,
};

const batch: ImportProject[] = [
  {
    name: 'Harbor shed',
    objective: 'Keep the dock usable',
    status: 'active',
    notebookPages: ['notes/Harbor shed (dock).md'],
    existingTaskIds: [paint.id],
    newTasks: [{ key: 'hinges', title: 'Order hinges' }],
    nextAction: { existingTaskId: paint.id },
  },
];

const writePlan = () => {
  let n = 0;
  const nextId = () => {
    n += 1;
    return `id-${n}`;
  };
  const decision = decideImport({
    projects: batch,
    organizationId: 'org-1',
    createdById: 'user-1',
    existingProjectNames: [],
    tasksById: new Map([[paint.id, paint]]),
    listsById: new Map(),
    memberIds: new Set(['user-1']),
    nextOpenOrderByListId: new Map([['', 0]]),
    actor: person,
    now,
    nextId,
  });
  expect(decision.isOk()).toBe(true);
  if (!decision.isOk()) {
    throw new Error('expected a valid import plan');
  }
  return planImport(decision.value, nextId);
};

describe('sqlite import persist', () => {
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
    const taskPersist = createSqliteTaskPersist({ db });
    const created = await taskPersist(
      planTaskChange({
        event: {
          type: 'TaskCreated',
          id: paint.id,
          organizationId: paint.organizationId,
          createdById: paint.createdById,
          title: paint.title,
          openOrder: 0,
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: person,
        ids: { recordId: 'log-paint' },
      })
    );
    expect(created.isOk()).toBe(true);
  });

  afterEach(async () => {
    await db.close();
  });

  it('writes projects, tasks, notebook pages, and import records in one batch', async () => {
    const imports = createSqliteImportStore(db);
    await imports.insert({
      id: 'import-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      createdAt: now,
      status: 'pending',
      projects: batch,
      decidedById: null,
      decidedAt: null,
    });

    const persist = createSqliteImportPersist({ db });
    const write = writePlan();
    const result = await persist({
      write,
      stagedImportId: 'import-1',
      decidedById: 'user-1',
      decidedAt: now,
    });
    expect(result.isOk()).toBe(true);

    const projects = await createSqliteProjectStore(db);
    const harbor = write.projects[0];
    expect(harbor).toBeDefined();
    if (!harbor) {
      return;
    }
    const loaded = (await projects.findById(harbor.id))._unsafeUnwrap();
    expect(loaded?.name).toBe('Harbor shed');
    expect(loaded?.createdAt).toBe(now);
    expect(loaded?.notebookPages.map((page) => page.path)).toEqual([
      'notes/Harbor shed (dock).md',
    ]);
    expect(loaded?.nextActionTaskId).toBe(paint.id);

    const tasks = await createSqliteTaskStore(db);
    const moved = (await tasks.findById(paint.id))._unsafeUnwrap();
    expect(moved?.projectId).toBe(harbor.id);
    expect(moved?.title).toBe('Paint the door');

    const log = createSqliteChangeLogStore(db);
    const projectHistory = (await log.findBySubject('project', harbor.id))._unsafeUnwrap();
    expect(projectHistory.map((record) => record.kind)).toEqual(['ProjectImported']);
    expect(projectHistory[0]?.payload).toMatchObject({
      taskCount: 2,
      name: 'Harbor shed',
    });

    const taskHistory = (await log.findBySubject('task', paint.id))._unsafeUnwrap();
    expect(taskHistory.map((record) => record.kind)).toEqual([
      'TaskCreated',
      'TaskAddedToProject',
      'TaskUpdated',
    ]);
    expect(taskHistory[1]?.payload).toMatchObject({ via: 'import' });

    const staged = (await imports.findById('import-1'))._unsafeUnwrap();
    expect(staged?.status).toBe('applied');
    expect(staged?.decidedById).toBe('user-1');
  });

  it('writes nothing when the last statement fails', async () => {
    const imports = createSqliteImportStore(db);
    await imports.insert({
      id: 'import-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      createdAt: now,
      status: 'pending',
      projects: batch,
      decidedById: null,
      decidedAt: null,
    });

    await db.execute({
      sql: `
        CREATE TRIGGER fail_last_import BEFORE UPDATE ON project_imports
        BEGIN
          SELECT RAISE(ABORT, 'import apply failed');
        END
      `,
    });

    const persist = createSqliteImportPersist({ db });
    const write = writePlan();
    const result = await persist({
      write,
      stagedImportId: 'import-1',
      decidedById: 'user-1',
      decidedAt: now,
    });
    expect(result.isErr()).toBe(true);

    const projects = await createSqliteProjectStore(db);
    expect((await projects.findByOrganization('org-1'))._unsafeUnwrap()).toEqual([]);

    const tasks = await createSqliteTaskStore(db);
    const moved = (await tasks.findById(paint.id))._unsafeUnwrap();
    expect(moved?.projectId).toBeUndefined();

    const remaining = await db.execute({
      sql: `SELECT kind FROM change_log ORDER BY seq ASC`,
    });
    expect(remaining.rows.map((row) => row.kind)).toEqual(['TaskCreated']);

    const staged = (await imports.findById('import-1'))._unsafeUnwrap();
    expect(staged?.status).toBe('pending');
    expect(staged?.decidedById).toBeNull();
  });
});

describe('store-backed import persist', () => {
  it('rolls back projects, tasks, history, and the staged import when the last record fails', async () => {
    const projects = createFakeProjectStore();
    const tasks = createFakeTaskStore({ initialTasks: [paint] });
    const changeLog = createFakeChangeLogStore();
    const imports = createFakeImportStore([
      {
        id: 'import-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        createdAt: now,
        status: 'pending',
        projects: batch,
        decidedById: null,
        decidedAt: null,
      },
    ]);

    const originalInsert = changeLog.insert;
    const write = writePlan();
    const totalRecords =
      write.tasks.reduce((sum, plan) => sum + plan.records.length, 0) + write.importRecords.length;
    let seen = 0;
    changeLog.insert = (record) => {
      seen += 1;
      if (seen === totalRecords) {
        return errAsync({ type: 'STORAGE_ERROR', message: 'history failed' });
      }
      return originalInsert(record);
    };

    const persist = createStoreBackedImportPersist({
      projects,
      tasks,
      changeLog,
      imports,
    });
    const result = await persist({
      write,
      stagedImportId: 'import-1',
      decidedById: 'user-1',
      decidedAt: now,
    });
    expect(result.isErr()).toBe(true);
    expect((await projects.findByOrganization('org-1'))._unsafeUnwrap()).toEqual([]);
    expect((await tasks.findById(paint.id))._unsafeUnwrap()?.projectId).toBeUndefined();
    expect(changeLog.records).toEqual([]);
    expect((await imports.findById('import-1'))._unsafeUnwrap()?.status).toBe('pending');
  });
});
