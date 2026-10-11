import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestAppWithWebAuthnAndDatabase,
  TEST_TOKEN,
  TEST_ORG_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type { Project, SetProjectNextActionResponse, Task } from '@yoink/api-contracts';
import type { Database } from '../../database/types.js';
import { createSqliteChangeLogStore } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';

describe('project next-action HTTP', () => {
  let app: FastifyInstance;
  let database: Database;

  beforeEach(async () => {
    const created = await createTestAppWithWebAuthnAndDatabase();
    app = created.app;
    database = created.database;
  });

  const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };
  const bearer = { authorization: `Bearer ${TEST_TOKEN}` };

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
      headers: bearer,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json<Task>();
  };

  const mintBot = async (name: string): Promise<{ rawToken: string }> => {
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name },
    });
    expect(minted.statusCode).toBe(201);
    return { rawToken: minted.json<{ rawToken: string }>().rawToken };
  };

  const setNext = (
    id: string,
    payload: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) =>
    app.inject({
      method: 'PUT',
      url: `/api/projects/${id}/next-action`,
      cookies: session.cookies,
      headers,
      payload,
    });

  it('sets a next action and returns it on GET project', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    const response = await setNext(garden.id, { taskId: soil.id });
    expect(response.statusCode).toBe(200);
    const body = response.json<SetProjectNextActionResponse>();
    expect(body.project.nextActionTaskId).toBe(soil.id);
    expect(body.task?.id).toBe(soil.id);

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/projects/${garden.id}`,
      headers: bearer,
    });
    expect(fetched.json<Project>().nextActionTaskId).toBe(soil.id);
  });

  it('replaces with one Set record and previousTaskId', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    const herbs = await createTask({ title: 'Plant herbs', projectId: garden.id });
    await setNext(garden.id, { taskId: soil.id });
    const replaced = await setNext(garden.id, { taskId: herbs.id });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json<SetProjectNextActionResponse>().project.nextActionTaskId).toBe(herbs.id);

    const log = createSqliteChangeLogStore(database);
    const records = (await log.findBySubject('project', garden.id))._unsafeUnwrap();
    const sets = records.filter((record) => record.kind === 'ProjectNextActionSet');
    expect(sets).toHaveLength(2);
    expect(sets[1]?.payload).toMatchObject({
      taskId: herbs.id,
      previousTaskId: soil.id,
    });
  });

  it('is a no-op when setting the same task again', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    await setNext(garden.id, { taskId: soil.id });
    const before = (
      await app.inject({
        method: 'GET',
        url: `/api/projects/${garden.id}`,
        headers: bearer,
      })
    ).json<Project>();
    const again = await setNext(garden.id, { taskId: soil.id });
    expect(again.statusCode).toBe(200);
    expect(again.json<SetProjectNextActionResponse>().project.lastChangedAt).toBe(
      before.lastChangedAt
    );
    const log = createSqliteChangeLogStore(database);
    const records = (await log.findBySubject('project', garden.id))._unsafeUnwrap();
    expect(records.filter((record) => record.kind === 'ProjectNextActionSet')).toHaveLength(1);
  });

  it('creates a new task and sets it in one request', async () => {
    const garden = await createProject('Garden');
    const response = await setNext(garden.id, { newTask: { title: 'Pick counters' } });
    expect(response.statusCode).toBe(200);
    const body = response.json<SetProjectNextActionResponse>();
    expect(body.task?.title).toBe('Pick counters');
    expect(body.project.nextActionTaskId).toBe(body.task?.id);
  });

  it('lets a bot set and clear', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    const { rawToken } = await mintBot('Next-action bot');
    const set = await setNext(garden.id, { taskId: soil.id }, { authorization: `Bearer ${rawToken}` });
    expect(set.statusCode).toBe(200);
    const cleared = await setNext(
      garden.id,
      { taskId: null },
      { authorization: `Bearer ${rawToken}` }
    );
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json<SetProjectNextActionResponse>().project.nextActionTaskId).toBeNull();
  });

  it('returns 404 for another org project and task', async () => {
    const missing = await setNext('00000000-0000-4000-8000-000000000099', {
      taskId: '00000000-0000-4000-8000-000000000098',
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<{ code: string }>().code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns TASK_NOT_OPEN for a finished task', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    await app.inject({
      method: 'POST',
      url: `/api/tasks/${soil.id}/complete`,
      headers: bearer,
      payload: {},
    });
    const response = await setNext(garden.id, { taskId: soil.id });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('TASK_NOT_OPEN');
  });

  it('returns TASK_NOT_IN_PROJECT when the task is elsewhere', async () => {
    const garden = await createProject('Garden');
    const cabin = await createProject('Cabin');
    const nails = await createTask({ title: 'Buy nails', projectId: cabin.id });
    const response = await setNext(garden.id, { taskId: nails.id });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('TASK_NOT_IN_PROJECT');
  });

  it('returns PROJECT_DONE when the project is done', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    await app.inject({
      method: 'PUT',
      url: `/api/projects/${garden.id}/status`,
      cookies: session.cookies,
      payload: { status: 'done', openTasks: 'complete' },
    });
    const response = await setNext(garden.id, { taskId: soil.id });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('PROJECT_DONE');
  });

  it('returns TASK_TITLE_BLANK for a blank new-task title', async () => {
    const garden = await createProject('Garden');
    const response = await setNext(garden.id, { newTask: { title: '   ' } });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('TASK_TITLE_BLANK');
  });

  it('returns TASK_TITLE_TOO_LONG for a too-long new-task title', async () => {
    const garden = await createProject('Garden');
    const response = await setNext(garden.id, { newTask: { title: 'x'.repeat(501) } });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('TASK_TITLE_TOO_LONG');
  });

  it('returns LIST_NOT_IN_ORGANIZATION for an unknown new-task list', async () => {
    const garden = await createProject('Garden');
    const response = await setNext(garden.id, {
      newTask: { title: 'Buy soil', listId: '00000000-0000-4000-8000-000000000088' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('LIST_NOT_IN_ORGANIZATION');
  });

  it('returns LIST_NOT_IN_ORGANIZATION for a new-task list in another org', async () => {
    const garden = await createProject('Garden');
    const created = await app.inject({
      method: 'POST',
      url: '/api/lists',
      cookies: session.cookies,
      payload: { name: 'Other org list' },
    });
    expect(created.statusCode).toBe(201);
    const listId = created.json<{ id: string }>().id;
    await database.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-other', 'Other', '2025-01-15T10:00:00.000Z'],
    });
    await database.execute({
      sql: `UPDATE lists SET organization_id = ? WHERE id = ?`,
      args: ['org-other', listId],
    });
    const response = await setNext(garden.id, {
      newTask: { title: 'Buy soil', listId },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('LIST_NOT_IN_ORGANIZATION');
  });

  it('returns ASSIGNEE_NOT_IN_ORGANIZATION for a new-task assignee outside the org', async () => {
    const garden = await createProject('Garden');
    const response = await setNext(garden.id, {
      newTask: {
        title: 'Buy soil',
        assigneeId: '00000000-0000-4000-8000-000000000066',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('ASSIGNEE_NOT_IN_ORGANIZATION');
  });

  it('clears the next action when the task is completed', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    await setNext(garden.id, { taskId: soil.id });
    await app.inject({
      method: 'POST',
      url: `/api/tasks/${soil.id}/complete`,
      headers: bearer,
      payload: {},
    });
    const fetched = await app.inject({
      method: 'GET',
      url: `/api/projects/${garden.id}`,
      headers: bearer,
    });
    expect(fetched.json<Project>().nextActionTaskId).toBeNull();
    const log = createSqliteChangeLogStore(database);
    const records = (await log.findBySubject('project', garden.id))._unsafeUnwrap();
    expect(records.some((record) => record.kind === 'ProjectNextActionCleared')).toBe(true);
  });

  it('clears the next action when the task moves to another project', async () => {
    const garden = await createProject('Garden');
    const cabin = await createProject('Cabin');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    await setNext(garden.id, { taskId: soil.id });
    const moved = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${soil.id}`,
      headers: bearer,
      payload: { projectId: cabin.id },
    });
    expect(moved.statusCode).toBe(200);
    const fetched = await app.inject({
      method: 'GET',
      url: `/api/projects/${garden.id}`,
      headers: bearer,
    });
    expect(fetched.json<Project>().nextActionTaskId).toBeNull();
    const log = createSqliteChangeLogStore(database);
    const records = (await log.findBySubject('project', garden.id))._unsafeUnwrap();
    expect(
      records.some(
        (record) =>
          record.kind === 'ProjectNextActionCleared' &&
          (record.payload as { reason?: string }).reason === 'removedFromProject'
      )
    ).toBe(true);
  });

  it('clears the next action when the project is marked done', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    await setNext(garden.id, { taskId: soil.id });
    const done = await app.inject({
      method: 'PUT',
      url: `/api/projects/${garden.id}/status`,
      cookies: session.cookies,
      payload: { status: 'done', openTasks: 'complete' },
    });
    expect(done.statusCode).toBe(200);
    const fetched = await app.inject({
      method: 'GET',
      url: `/api/projects/${garden.id}`,
      headers: bearer,
    });
    expect(fetched.json<Project>().nextActionTaskId).toBeNull();
    const log = createSqliteChangeLogStore(database);
    const records = (await log.findBySubject('project', garden.id))._unsafeUnwrap();
    expect(
      records.some(
        (record) =>
          record.kind === 'ProjectNextActionCleared' &&
          (record.payload as { reason?: string }).reason === 'projectDone'
      )
    ).toBe(true);
  });
});
