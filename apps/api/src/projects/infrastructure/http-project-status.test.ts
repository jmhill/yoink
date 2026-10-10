import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestAppWithWebAuthnAndDatabase,
  TEST_TOKEN,
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type {
  ChangeProjectStatusResponse,
  Project,
  Task,
} from '@yoink/api-contracts';
import type { Database } from '../../database/types.js';
import { createSqliteChangeLogStore } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';

describe('project status HTTP', () => {
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

  const mintBot = async (name: string): Promise<{ rawToken: string; userId: string }> => {
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name },
    });
    expect(minted.statusCode).toBe(201);
    const body = minted.json<{ rawToken: string; agent: { userId: string } }>();
    return { rawToken: body.rawToken, userId: body.agent.userId };
  };

  const changeStatus = (
    id: string,
    payload: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) =>
    app.inject({
      method: 'PUT',
      url: `/api/projects/${id}/status`,
      cookies: session.cookies,
      headers,
      payload,
    });

  it('sets waiting with who and unknown since through the API', async () => {
    const garden = await createProject('Garden');
    const response = await changeStatus(garden.id, {
      status: 'waiting',
      waitingOn: 'Mike',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<ChangeProjectStatusResponse>();
    expect(body.project.status).toBe('waiting');
    expect(body.project.waitingOn).toBe('Mike');
    expect(body.project.waitingSince).toBeNull();
    expect(body.completedTaskCount).toBe(0);
    expect(body.removedTaskCount).toBe(0);
  });

  it('is a no-op when status and waiting values are unchanged', async () => {
    const garden = await createProject('Garden');
    await changeStatus(garden.id, {
      status: 'waiting',
      waitingOn: 'Mike',
      waitingSince: '2026-10-01',
    });
    const first = await app.inject({
      method: 'GET',
      url: `/api/projects/${garden.id}`,
      headers: bearer,
    });
    const before = first.json<Project>();

    const again = await changeStatus(garden.id, {
      status: 'waiting',
      waitingOn: 'Mike',
      waitingSince: '2026-10-01',
    });
    expect(again.statusCode).toBe(200);
    const body = again.json<ChangeProjectStatusResponse>().project;
    expect(body.lastChangedAt).toBe(before.lastChangedAt);

    const log = createSqliteChangeLogStore(database);
    const records = (await log.findBySubject('project', garden.id))._unsafeUnwrap();
    expect(records.map((record) => record.kind)).toEqual(['ProjectCreated', 'ProjectStatusChanged']);
  });

  it('writes a status-change record with who and when', async () => {
    const garden = await createProject('Garden');
    await changeStatus(garden.id, {
      status: 'waiting',
      waitingOn: 'Mike',
      waitingSince: '2026-10-01',
    });

    const log = createSqliteChangeLogStore(database);
    const records = (await log.findBySubject('project', garden.id))._unsafeUnwrap();
    const changed = records.find((record) => record.kind === 'ProjectStatusChanged');
    expect(changed?.projectId).toBe(garden.id);
    expect(changed?.actorUserId).toBe(TEST_USER_ID);
    expect(changed?.actorKind).toBe('user');
    expect(changed?.payload).toMatchObject({
      from: 'active',
      to: 'waiting',
      waitingOn: 'Mike',
      waitingSince: '2026-10-01',
    });
  });

  it('refuses a bot marking a project done and reopening it', async () => {
    const garden = await createProject('Garden');
    const bot = await mintBot('Status bot');

    const done = await app.inject({
      method: 'PUT',
      url: `/api/projects/${garden.id}/status`,
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: { status: 'done' },
    });
    expect(done.statusCode).toBe(403);
    expect(done.json()).toEqual({
      message: 'Marking a project done requires a person',
      code: 'PROJECT_DONE_REQUIRES_PERSON',
    });

    await changeStatus(garden.id, { status: 'done' });

    const reopen = await app.inject({
      method: 'PUT',
      url: `/api/projects/${garden.id}/status`,
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: { status: 'active' },
    });
    expect(reopen.statusCode).toBe(403);
    expect(reopen.json()).toEqual({
      message: 'Reopening a done project requires a person',
      code: 'PROJECT_REOPEN_REQUIRES_PERSON',
    });
  });

  it('lets a bot set waiting and someday', async () => {
    const garden = await createProject('Garden');
    const bot = await mintBot('Waiting bot');

    const waiting = await app.inject({
      method: 'PUT',
      url: `/api/projects/${garden.id}/status`,
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: { status: 'waiting', waitingOn: 'Trident' },
    });
    expect(waiting.statusCode).toBe(200);
    expect(waiting.json<ChangeProjectStatusResponse>().project.status).toBe('waiting');

    const someday = await app.inject({
      method: 'PUT',
      url: `/api/projects/${garden.id}/status`,
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: { status: 'someday' },
    });
    expect(someday.statusCode).toBe(200);
    expect(someday.json<ChangeProjectStatusResponse>().project.status).toBe('someday');
    expect(someday.json<ChangeProjectStatusResponse>().project.waitingOn).toBeNull();
  });

  it('refuses done with open tasks and no choice', async () => {
    const garden = await createProject('Garden');
    await createTask({ title: 'Buy soil', projectId: garden.id });
    await createTask({ title: 'Plant herbs', projectId: garden.id });

    const response = await changeStatus(garden.id, { status: 'done' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: 'This project has 2 open tasks',
      code: 'PROJECT_HAS_OPEN_TASKS',
    });
  });

  it('completes open tasks then marks the project done in one batch', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });
    const herbs = await createTask({ title: 'Plant herbs', projectId: garden.id });

    const response = await changeStatus(garden.id, {
      status: 'done',
      openTasks: 'complete',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<ChangeProjectStatusResponse>();
    expect(body.project.status).toBe('done');
    expect(body.completedTaskCount).toBe(2);

    const soilAfter = await app.inject({
      method: 'GET',
      url: `/api/tasks/${soil.id}`,
      headers: bearer,
    });
    expect(soilAfter.json<Task>().completedAt).toBeTruthy();
    expect(soilAfter.json<Task>().projectId).toBe(garden.id);

    const herbsAfter = await app.inject({
      method: 'GET',
      url: `/api/tasks/${herbs.id}`,
      headers: bearer,
    });
    expect(herbsAfter.json<Task>().completedAt).toBeTruthy();

    const log = createSqliteChangeLogStore(database);
    const taskRecords = (await log.findBySubject('task', soil.id))._unsafeUnwrap();
    expect(taskRecords.some((record) => record.kind === 'TaskCompleted')).toBe(true);
  });

  it('removes open tasks from the project then marks it done', async () => {
    const garden = await createProject('Garden');
    const soil = await createTask({ title: 'Buy soil', projectId: garden.id });

    const response = await changeStatus(garden.id, {
      status: 'done',
      openTasks: 'remove',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<ChangeProjectStatusResponse>().removedTaskCount).toBe(1);

    const soilAfter = await app.inject({
      method: 'GET',
      url: `/api/tasks/${soil.id}`,
      headers: bearer,
    });
    expect(soilAfter.json<Task>().projectId).toBeUndefined();
    expect(soilAfter.json<Task>().completedAt).toBeUndefined();

    const log = createSqliteChangeLogStore(database);
    const taskRecords = (await log.findBySubject('task', soil.id))._unsafeUnwrap();
    expect(taskRecords.some((record) => record.kind === 'TaskRemovedFromProject')).toBe(true);
  });

  it('returns 404 for another organization\'s project', async () => {
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
        TEST_USER_ID,
        'Other garden',
        'active',
        '2025-01-15T10:00:00.000Z',
      ],
    });

    const response = await changeStatus('550e8400-e29b-41d4-a716-446655440099', {
      status: 'someday',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      message: 'Project not found',
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('refuses proposed as a target status with a fixed code', async () => {
    const garden = await createProject('Garden');
    const response = await changeStatus(garden.id, { status: 'proposed' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Status must be active, waiting, someday, or done',
      code: 'INVALID_PROJECT_STATUS',
    });
  });

  it('refuses a blank waiting on with a fixed code', async () => {
    const garden = await createProject('Garden');
    const response = await changeStatus(garden.id, {
      status: 'waiting',
      waitingOn: '   ',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('PROJECT_WAITING_ON_BLANK');
  });

  it('requires waiting on when choosing waiting', async () => {
    const garden = await createProject('Garden');
    const response = await changeStatus(garden.id, { status: 'waiting' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Waiting on is required',
      code: 'PROJECT_WAITING_ON_REQUIRED',
    });
  });
});
