import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import { okAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import { createTestDatabase } from '../../database/test-utils.js';
import type { Database } from '../../database/types.js';
import { createFakeCaptureStore } from '../../captures/infrastructure/fake-capture-store.js';
import { createFakeProjectStore } from '../../projects/infrastructure/fake-project-store.js';
import { createFakeTaskStore } from '../../tasks/infrastructure/fake-task-store.js';
import { createFakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import { createFakeListStore } from '../../lists/infrastructure/fake-list-store.js';
import { createSqliteCaptureStore } from '../../captures/infrastructure/sqlite-capture-store.js';
import { createSqliteProjectStore } from '../../projects/infrastructure/sqlite-project-store.js';
import { createSqliteTaskStore } from '../../tasks/infrastructure/sqlite-task-store.js';
import { handleProcessCaptureToProject } from '../application/handle-process-to-project.js';
import { handleProcessCaptureToTask } from '../application/handle-process-to-task.js';
import { decideProcessCaptureToProject } from '../domain/decide-process-to-project.js';
import { decideProcessCaptureToTask } from '../domain/decide-process-to-task.js';
import { planProjectChange } from '../../projects/domain/plan-project-change.js';
import { planTaskChange } from '../../tasks/domain/plan-task-change.js';
import {
  createFakeProcessToProjectPersist,
  createFakeProcessToTaskPersist,
  createSqliteProcessToProjectPersist,
  createSqliteProcessToTaskPersist,
} from './persist-process.js';

const now = '2026-10-11T18:00:00.000Z';
const person = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };

const inboxCapture = (overrides: Partial<Capture> = {}): Capture => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: 'org-1',
  createdById: 'user-1',
  content: 'Harbor shed',
  status: 'inbox',
  capturedAt: '2026-09-12T02:40:00.000Z',
  ...overrides,
});

const projectPlanWhileInbox = (capture: Capture) => {
  const ids = createFakeIdGenerator();
  const decision = decideProcessCaptureToProject({
    command: {
      id: capture.id,
      organizationId: capture.organizationId,
      createdById: capture.createdById,
      name: 'Harbor',
      status: 'active',
      actor: person,
    },
    capture,
    existingNames: [],
    ids: { projectId: ids.generate() },
    now,
  });
  if (decision.isErr()) {
    throw new Error(decision.error.type);
  }
  const plan = planProjectChange({
    event: decision.value.projectCreated,
    current: null,
    actor: person,
    ids: { recordId: ids.generate() },
  });
  if (plan.action !== 'insert') {
    throw new Error('expected insert plan');
  }
  return {
    project: plan,
    capture: {
      id: decision.value.captureProcessed.id,
      organizationId: decision.value.captureProcessed.organizationId,
      processedAt: decision.value.captureProcessed.processedAt,
      processedToType: decision.value.captureProcessed.processedToType,
      processedToId: decision.value.captureProcessed.processedToId,
    },
  };
};

const taskPlanWhileInbox = (capture: Capture) => {
  const ids = createFakeIdGenerator();
  const taskId = ids.generate();
  const decision = decideProcessCaptureToTask({
    command: {
      id: capture.id,
      organizationId: capture.organizationId,
      createdById: capture.createdById,
      actor: person,
    },
    capture,
    list: null,
    project: null,
    assigneeInOrganization: null,
    nextOpenOrder: 0,
    id: taskId,
    now,
  });
  if (decision.isErr()) {
    throw new Error(decision.error.type);
  }
  const plan = planTaskChange({
    event: decision.value.taskCreated,
    current: null,
    actor: person,
    ids: { recordId: ids.generate() },
  });
  if (plan.action !== 'insert') {
    throw new Error('expected insert plan');
  }
  return {
    task: plan,
    capture: {
      id: decision.value.captureProcessed.id,
      organizationId: decision.value.captureProcessed.organizationId,
      processedAt: decision.value.captureProcessed.processedAt,
      processedToType: decision.value.captureProcessed.processedToType,
      processedToId: decision.value.captureProcessed.processedToId,
    },
  };
};

describe('process persist — fake', () => {
  it('rolls back the project when marking the capture fails', async () => {
    const capture = inboxCapture();
    const captures = createFakeCaptureStore({
      initialCaptures: [capture],
      shouldFailOnSave: true,
    });
    const projects = createFakeProjectStore();
    const changeLog = createFakeChangeLogStore();
    const persist = createFakeProcessToProjectPersist({
      projects,
      captures,
      changeLog,
    });
    const ids = createFakeIdGenerator();

    const result = await handleProcessCaptureToProject(
      {
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
        name: 'Harbor',
        status: 'active',
        actor: person,
      },
      {
        loadCapture: (id) => captures.findById(id),
        listProjects: (organizationId) => projects.findByOrganization(organizationId),
        persist,
        nextId: () => ids.generate(),
        now: () => now,
      }
    );

    expect(result.isErr()).toBe(true);
    const still = await captures.findById(capture.id);
    expect(still._unsafeUnwrap()?.status).toBe('inbox');
    const listed = await projects.findByOrganization('org-1');
    expect(listed._unsafeUnwrap()).toHaveLength(0);
    expect(changeLog.records).toHaveLength(0);
  });

  it('rolls back the task when marking the capture fails', async () => {
    const capture = inboxCapture();
    const captures = createFakeCaptureStore({
      initialCaptures: [capture],
      shouldFailOnSave: true,
    });
    const tasks = createFakeTaskStore();
    const lists = createFakeListStore();
    const changeLog = createFakeChangeLogStore();
    const persist = createFakeProcessToTaskPersist({
      tasks,
      captures,
      changeLog,
    });
    const ids = createFakeIdGenerator();

    const result = await handleProcessCaptureToTask(
      {
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
        actor: person,
      },
      {
        loadCapture: (id) => captures.findById(id),
        loadList: (id) => lists.findById(id),
        loadProject: () => okAsync(null),
        loadNextOpenOrder: (organizationId, listId) =>
          tasks.nextOpenOrderInPile({ organizationId, listId }),
        persist,
        nextId: () => ids.generate(),
        now: () => now,
      }
    );

    expect(result.isErr()).toBe(true);
    expect((await captures.findById(capture.id))._unsafeUnwrap()?.status).toBe('inbox');
    const open = await tasks.findOpenInPile({ organizationId: 'org-1', listId: null });
    expect(open._unsafeUnwrap()).toHaveLength(0);
    expect(changeLog.records).toHaveLength(0);
  });

  it('writes nothing when a stale project plan hits a trashed capture', async () => {
    const capture = inboxCapture();
    const captures = createFakeCaptureStore({ initialCaptures: [capture] });
    const projects = createFakeProjectStore();
    const changeLog = createFakeChangeLogStore();
    const persist = createFakeProcessToProjectPersist({ projects, captures, changeLog });
    const plan = projectPlanWhileInbox(capture);
    await captures.update({ ...capture, status: 'trashed' });

    const result = await persist(plan);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
    expect((await projects.findByOrganization('org-1'))._unsafeUnwrap()).toHaveLength(0);
    expect(changeLog.records).toHaveLength(0);
    expect((await captures.findById(capture.id))._unsafeUnwrap()?.status).toBe('trashed');
  });

  it('writes nothing when a stale project plan hits a processed capture', async () => {
    const capture = inboxCapture();
    const captures = createFakeCaptureStore({ initialCaptures: [capture] });
    const projects = createFakeProjectStore();
    const changeLog = createFakeChangeLogStore();
    const persist = createFakeProcessToProjectPersist({ projects, captures, changeLog });
    const plan = projectPlanWhileInbox(capture);
    await captures.update({ ...capture, status: 'processed' });

    const result = await persist(plan);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
    expect((await projects.findByOrganization('org-1'))._unsafeUnwrap()).toHaveLength(0);
    expect(changeLog.records).toHaveLength(0);
    expect((await captures.findById(capture.id))._unsafeUnwrap()?.status).toBe('processed');
  });

  it('writes nothing when a stale task plan hits a trashed capture', async () => {
    const capture = inboxCapture();
    const captures = createFakeCaptureStore({ initialCaptures: [capture] });
    const tasks = createFakeTaskStore();
    const changeLog = createFakeChangeLogStore();
    const persist = createFakeProcessToTaskPersist({ tasks, captures, changeLog });
    const plan = taskPlanWhileInbox(capture);
    await captures.update({ ...capture, status: 'trashed' });

    const result = await persist(plan);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
    expect(
      (await tasks.findOpenInPile({ organizationId: 'org-1', listId: null }))._unsafeUnwrap()
    ).toHaveLength(0);
    expect(changeLog.records).toHaveLength(0);
    expect((await captures.findById(capture.id))._unsafeUnwrap()?.status).toBe('trashed');
  });

  it('writes nothing when a stale task plan hits a processed capture', async () => {
    const capture = inboxCapture();
    const captures = createFakeCaptureStore({ initialCaptures: [capture] });
    const tasks = createFakeTaskStore();
    const changeLog = createFakeChangeLogStore();
    const persist = createFakeProcessToTaskPersist({ tasks, captures, changeLog });
    const plan = taskPlanWhileInbox(capture);
    await captures.update({ ...capture, status: 'processed' });

    const result = await persist(plan);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
    expect(
      (await tasks.findOpenInPile({ organizationId: 'org-1', listId: null }))._unsafeUnwrap()
    ).toHaveLength(0);
    expect(changeLog.records).toHaveLength(0);
    expect((await captures.findById(capture.id))._unsafeUnwrap()?.status).toBe('processed');
  });
});

describe('process persist — sqlite', () => {
  let db: Database;
  const clock = createFakeClock(new Date(now));

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
      sql: `
        INSERT INTO captures (
          id, organization_id, created_by_id, content, status, captured_at
        ) VALUES (?, ?, ?, ?, 'inbox', ?)
      `,
      args: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'org-1',
        'user-1',
        'Harbor shed',
        now,
      ],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('writes the project, history, and processed mark together', async () => {
    const captures = await createSqliteCaptureStore(db, clock);
    const projects = await createSqliteProjectStore(db);
    const ids = createFakeIdGenerator();
    const result = await handleProcessCaptureToProject(
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationId: 'org-1',
        createdById: 'user-1',
        name: 'Harbor',
        status: 'someday',
        actor: person,
      },
      {
        loadCapture: (id) => captures.findById(id),
        listProjects: (organizationId) => projects.findByOrganization(organizationId),
        persist: createSqliteProcessToProjectPersist({ db }),
        nextId: () => ids.generate(),
        now: () => now,
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.project.status).toBe('someday');
      expect(result.value.capture.processedToType).toBe('project');
      expect(result.value.capture.processedToId).toBe(result.value.project.id);
    }
    const capture = (await captures.findById('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))._unsafeUnwrap();
    expect(capture?.status).toBe('processed');
    const history = await db.execute({
      sql: `SELECT kind FROM change_log WHERE kind = 'ProjectCreated'`,
    });
    expect(history.rows).toHaveLength(1);
  });

  it('creates no project when the capture is no longer in the inbox', async () => {
    await db.execute({
      sql: `UPDATE captures SET status = 'trashed' WHERE id = ?`,
      args: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    });
    const captures = await createSqliteCaptureStore(db, clock);
    const projects = await createSqliteProjectStore(db);
    const ids = createFakeIdGenerator();
    const result = await handleProcessCaptureToProject(
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationId: 'org-1',
        createdById: 'user-1',
        name: 'Harbor',
        status: 'active',
        actor: person,
      },
      {
        loadCapture: (id) => captures.findById(id),
        listProjects: (organizationId) => projects.findByOrganization(organizationId),
        persist: createSqliteProcessToProjectPersist({ db }),
        nextId: () => ids.generate(),
        now: () => now,
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
    const listed = await projects.findByOrganization('org-1');
    expect(listed._unsafeUnwrap()).toHaveLength(0);
  });

  it('leaves no task when the mark step is aborted', async () => {
    await db.execute({
      sql: `
        CREATE TRIGGER fail_mark BEFORE UPDATE ON captures
        WHEN NEW.status = 'processed'
        BEGIN
          SELECT RAISE(ABORT, 'mark failed');
        END
      `,
    });
    const captures = await createSqliteCaptureStore(db, clock);
    const tasks = await createSqliteTaskStore(db);
    const lists = createFakeListStore();
    const ids = createFakeIdGenerator();
    const result = await handleProcessCaptureToTask(
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationId: 'org-1',
        createdById: 'user-1',
        actor: person,
      },
      {
        loadCapture: (id) => captures.findById(id),
        loadList: (id) => lists.findById(id),
        loadProject: () => okAsync(null),
        loadNextOpenOrder: (organizationId, listId) =>
          tasks.nextOpenOrderInPile({ organizationId, listId }),
        persist: createSqliteProcessToTaskPersist({ db }),
        nextId: () => ids.generate(),
        now: () => now,
      }
    );

    expect(result.isErr()).toBe(true);
    const capture = (await captures.findById('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))._unsafeUnwrap();
    expect(capture?.status).toBe('inbox');
    const taskRows = await db.execute({ sql: `SELECT id FROM tasks` });
    expect(taskRows.rows).toHaveLength(0);
    const logRows = await db.execute({ sql: `SELECT id FROM change_log` });
    expect(logRows.rows).toHaveLength(0);
  });

  it('leaves no project when the mark step is aborted', async () => {
    await db.execute({
      sql: `
        CREATE TRIGGER fail_project_mark BEFORE UPDATE ON captures
        WHEN NEW.status = 'processed'
        BEGIN
          SELECT RAISE(ABORT, 'mark failed');
        END
      `,
    });
    const captures = await createSqliteCaptureStore(db, clock);
    const projects = await createSqliteProjectStore(db);
    const ids = createFakeIdGenerator();
    const result = await handleProcessCaptureToProject(
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationId: 'org-1',
        createdById: 'user-1',
        name: 'Harbor',
        status: 'active',
        actor: person,
      },
      {
        loadCapture: (id) => captures.findById(id),
        listProjects: (organizationId) => projects.findByOrganization(organizationId),
        persist: createSqliteProcessToProjectPersist({ db }),
        nextId: () => ids.generate(),
        now: () => now,
      }
    );

    expect(result.isErr()).toBe(true);
    expect((await captures.findById('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))._unsafeUnwrap()?.status).toBe(
      'inbox'
    );
    expect((await projects.findByOrganization('org-1'))._unsafeUnwrap()).toHaveLength(0);
    const logRows = await db.execute({ sql: `SELECT id FROM change_log` });
    expect(logRows.rows).toHaveLength(0);
  });

  it('hits the SQL guard when a project plan is applied after the capture is trashed', async () => {
    const capture = inboxCapture();
    const plan = projectPlanWhileInbox(capture);
    await db.execute({
      sql: `UPDATE captures SET status = 'trashed' WHERE id = ?`,
      args: [capture.id],
    });
    const persist = createSqliteProcessToProjectPersist({ db });
    const result = await persist(plan);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
    const projects = await db.execute({ sql: `SELECT id FROM projects` });
    expect(projects.rows).toHaveLength(0);
    const logRows = await db.execute({ sql: `SELECT id FROM change_log` });
    expect(logRows.rows).toHaveLength(0);
    const row = await db.execute({
      sql: `SELECT status FROM captures WHERE id = ?`,
      args: [capture.id],
    });
    expect(row.rows[0]?.status).toBe('trashed');
  });

  it('hits the SQL guard when a project plan is applied after the capture is processed', async () => {
    const capture = inboxCapture();
    const plan = projectPlanWhileInbox(capture);
    await db.execute({
      sql: `UPDATE captures SET status = 'processed' WHERE id = ?`,
      args: [capture.id],
    });
    const persist = createSqliteProcessToProjectPersist({ db });
    const result = await persist(plan);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
    const projects = await db.execute({ sql: `SELECT id FROM projects` });
    expect(projects.rows).toHaveLength(0);
    const logRows = await db.execute({ sql: `SELECT id FROM change_log` });
    expect(logRows.rows).toHaveLength(0);
    const row = await db.execute({
      sql: `SELECT status FROM captures WHERE id = ?`,
      args: [capture.id],
    });
    expect(row.rows[0]?.status).toBe('processed');
  });

  it('hits the SQL guard when a task plan is applied after the capture is trashed', async () => {
    const capture = inboxCapture();
    const plan = taskPlanWhileInbox(capture);
    await db.execute({
      sql: `UPDATE captures SET status = 'trashed' WHERE id = ?`,
      args: [capture.id],
    });
    const persist = createSqliteProcessToTaskPersist({ db });
    const result = await persist(plan);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
    const tasks = await db.execute({ sql: `SELECT id FROM tasks` });
    expect(tasks.rows).toHaveLength(0);
    const logRows = await db.execute({ sql: `SELECT id FROM change_log` });
    expect(logRows.rows).toHaveLength(0);
    const row = await db.execute({
      sql: `SELECT status FROM captures WHERE id = ?`,
      args: [capture.id],
    });
    expect(row.rows[0]?.status).toBe('trashed');
  });

  it('hits the SQL guard when a task plan is applied after the capture is processed', async () => {
    const capture = inboxCapture();
    const plan = taskPlanWhileInbox(capture);
    await db.execute({
      sql: `UPDATE captures SET status = 'processed' WHERE id = ?`,
      args: [capture.id],
    });
    const persist = createSqliteProcessToTaskPersist({ db });
    const result = await persist(plan);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
    const tasks = await db.execute({ sql: `SELECT id FROM tasks` });
    expect(tasks.rows).toHaveLength(0);
    const logRows = await db.execute({ sql: `SELECT id FROM change_log` });
    expect(logRows.rows).toHaveLength(0);
    const row = await db.execute({
      sql: `SELECT status FROM captures WHERE id = ?`,
      args: [capture.id],
    });
    expect(row.rows[0]?.status).toBe('processed');
  });
});
