import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestAppWithWebAuthnAndDatabase,
  TEST_TOKEN,
  TEST_ORG_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type { Project, Task, TaskListPage } from '@yoink/api-contracts';
import type { Database } from '../../database/types.js';
import { createSqliteChangeLogStore } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';

describe('task project membership HTTP', () => {
  let app: FastifyInstance;
  let database: Database;

  beforeEach(async () => {
    const created = await createTestAppWithWebAuthnAndDatabase();
    app = created.app;
    database = created.database;
  });

  const auth = { authorization: `Bearer ${TEST_TOKEN}` };
  const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };

  const createProject = async (name: string): Promise<Project> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      payload: { name },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Project>();
  };

  const createTask = async (payload: { title: string; projectId?: string }): Promise<Task> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: auth,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json<Task>();
  };

  it('creates a task with projectId', async () => {
    const garden = await createProject('Garden');
    const task = await createTask({ title: 'Buy soil', projectId: garden.id });
    expect(task.projectId).toBe(garden.id);
  });

  it('lets a bot set and clear a task project', async () => {
    const garden = await createProject('Garden');
    const task = await createTask({ title: 'Bot chore' });
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Project setter' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken } = minted.json<{ rawToken: string }>();

    const set = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { projectId: garden.id },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json<Task>().projectId).toBe(garden.id);

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { projectId: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json<Task>().projectId).toBeUndefined();
  });

  it('lists open project tasks newest-first with paging fields', async () => {
    const garden = await createProject('Garden');
    const older = await createTask({ title: 'Older', projectId: garden.id });
    const newer = await createTask({ title: 'Newer', projectId: garden.id });
    await createTask({ title: 'Elsewhere' });

    const listed = await app.inject({
      method: 'GET',
      url: `/api/projects/${garden.id}/tasks`,
      headers: auth,
    });
    expect(listed.statusCode).toBe(200);
    const page = listed.json<TaskListPage>();
    expect(page.tasks.map((task) => task.title)).toEqual(['Newer', 'Older']);
    expect(page.tasks.map((task) => task.id)).toEqual([newer.id, older.id]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.total).toBe(2);
  });

  it('omits finished tasks from the project page list', async () => {
    const garden = await createProject('Garden');
    const open = await createTask({ title: 'Open', projectId: garden.id });
    const done = await createTask({ title: 'Done', projectId: garden.id });
    const completed = await app.inject({
      method: 'POST',
      url: `/api/tasks/${done.id}/complete`,
      headers: auth,
      payload: {},
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<Task>().projectId).toBe(garden.id);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/projects/${garden.id}/tasks`,
      headers: auth,
    });
    expect(listed.json<TaskListPage>().tasks.map((task) => task.id)).toEqual([open.id]);
  });

  it('returns 404 for another organization\'s project tasks', async () => {
    await database.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-other', 'Other', '2025-01-15T10:00:00.000Z'],
    });
    await database.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        '550e8400-e29b-41d4-a716-446655440099',
        'org-other',
        '550e8400-e29b-41d4-a716-446655440002',
        'Other garden',
        'active',
        '2025-01-15T10:00:00.000Z',
      ],
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/projects/550e8400-e29b-41d4-a716-446655440099/tasks',
      headers: auth,
    });
    expect(listed.statusCode).toBe(404);
  });

  it('writes add/remove change-log records with the right project ids', async () => {
    const garden = await createProject('Garden');
    const cabin = await createProject('Cabin');
    const task = await createTask({ title: 'Move me' });

    await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { projectId: garden.id },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { projectId: cabin.id },
    });

    const changeLog = createSqliteChangeLogStore(database);
    const records = (await changeLog.findBySubject('task', task.id))._unsafeUnwrap();
    const kinds = records.map((record) => record.kind);
    expect(kinds).toContain('TaskAddedToProject');
    expect(kinds).toContain('TaskRemovedFromProject');
    const removed = records.find((record) => record.kind === 'TaskRemovedFromProject');
    const added = records.filter((record) => record.kind === 'TaskAddedToProject');
    expect(removed?.projectId).toBe(garden.id);
    expect(added[added.length - 1]?.projectId).toBe(cabin.id);
  });

  it('refuses a done project and leaves list membership untouched', async () => {
    const groceries = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: auth,
      payload: { name: 'Groceries' },
    });
    expect(groceries.statusCode).toBe(201);
    const listId = groceries.json<{ id: string }>().id;

    await database.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        '550e8400-e29b-41d4-a716-446655440088',
        TEST_ORG_ID,
        '550e8400-e29b-41d4-a716-446655440002',
        'Finished garden',
        'done',
        '2025-01-15T10:00:00.000Z',
      ],
    });

    const listed = await createTask({ title: 'On a list' });
    const onList = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${listed.id}`,
      headers: auth,
      payload: { listId },
    });
    expect(onList.statusCode).toBe(200);
    expect(onList.json<Task>().openOrder).toBeDefined();
    const openOrder = onList.json<Task>().openOrder;

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${listed.id}`,
      headers: auth,
      payload: { projectId: '550e8400-e29b-41d4-a716-446655440088' },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toContain('done project');

    const still = await app.inject({
      method: 'GET',
      url: `/api/tasks/${listed.id}`,
      headers: auth,
    });
    expect(still.json<Task>().listId).toBe(listId);
    expect(still.json<Task>().openOrder).toBe(openOrder);
    expect(still.json<Task>().projectId).toBeUndefined();
  });

  it('refuses moving a finished task into a project', async () => {
    const garden = await createProject('Garden');
    const task = await createTask({ title: 'Finished' });
    const completed = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/complete`,
      headers: auth,
      payload: {},
    });
    expect(completed.statusCode).toBe(200);

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { projectId: garden.id },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toBe(
      'Only open tasks can be added to or taken off a project'
    );
  });

  it('refuses clearing a finished task project and leaves membership', async () => {
    const garden = await createProject('Garden');
    const task = await createTask({ title: 'Finished in garden', projectId: garden.id });
    const completed = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/complete`,
      headers: auth,
      payload: {},
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<Task>().projectId).toBe(garden.id);

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { projectId: null },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toBe(
      'Only open tasks can be added to or taken off a project'
    );

    const still = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
      headers: auth,
    });
    expect(still.json<Task>().projectId).toBe(garden.id);
    expect(still.json<Task>().completedAt).toBeDefined();
  });

  it('names the list refusal when a finished task PATCH includes both list and project', async () => {
    const garden = await createProject('Garden');
    const list = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: auth,
      payload: { name: 'Groceries' },
    });
    expect(list.statusCode).toBe(201);
    const other = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: auth,
      payload: { name: 'Weekend' },
    });
    expect(other.statusCode).toBe(201);
    const task = await createTask({ title: 'On groceries' });
    const onList = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { listId: list.json<{ id: string }>().id },
    });
    expect(onList.statusCode).toBe(200);
    const completed = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/complete`,
      headers: auth,
      payload: {},
    });
    expect(completed.statusCode).toBe(200);

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: {
        listId: other.json<{ id: string }>().id,
        projectId: garden.id,
      },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toBe(
      'Only open tasks can be added to or taken off a list'
    );
  });
});
