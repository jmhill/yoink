import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DoneListPage, Project, ReviewPage, Task } from '@yoink/api-contracts';
import { encodeKeysetCursor } from '../../listing/application/keyset-codec.js';
import { doneListCursor, workDueCursor } from '../../listing/domain/list-keys.js';
import {
  createTestApp,
  createTestAppAndDatabase,
  createTestAppWithWebAuthnAndDatabase,
  TEST_ORG_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
  TEST_TOKEN,
} from '../../tests/helpers/test-app.js';

const auth = { authorization: `Bearer ${TEST_TOKEN}` };
const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };

const createProject = async (app: FastifyInstance, name: string): Promise<Project> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: auth,
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Project>();
};

const createTask = async (
  app: FastifyInstance,
  payload: { title: string; projectId?: string }
): Promise<Task> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks',
    headers: auth,
    payload,
  });
  expect(response.statusCode).toBe(201);
  return response.json<Task>();
};

const setNext = async (app: FastifyInstance, projectId: string, taskId: string): Promise<void> => {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/projects/${projectId}/next-action`,
    headers: auth,
    payload: { taskId },
  });
  expect(response.statusCode).toBe(200);
};

const setWaiting = async (
  app: FastifyInstance,
  projectId: string,
  waitingOn: string,
  waitingSince?: string
): Promise<void> => {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/projects/${projectId}/status`,
    headers: auth,
    payload: {
      status: 'waiting',
      waitingOn,
      ...(waitingSince === undefined ? {} : { waitingSince }),
    },
  });
  expect(response.statusCode).toBe(200);
};

describe('GET /api/review', () => {
  it('returns 401 without a token', async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/review' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a bogus time zone as INVALID_TIME_ZONE', async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/review?timeZone=Mars/Base',
      headers: auth,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Invalid IANA time zone',
      code: 'INVALID_TIME_ZONE',
    });
  });

  it('rejects a cursor from another view as invalid_cursor', async () => {
    const app = await createTestApp();
    const cursor = encodeKeysetCursor(
      workDueCursor.of({
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: TEST_ORG_ID,
        createdById: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Cursor',
        createdAt: '2026-10-12T01:00:00.000Z',
        dueDate: '2026-10-11',
        lastChangedAt: null,
        lastChangedBy: null,
        completedBy: null,
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/api/review?cursor=${encodeURIComponent(cursor)}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code?: string }>().code).toBe('invalid_cursor');
  });

  it('returns the 200 attention shape, Chicago today when timeZone is omitted, and UTC when sent', async () => {
    const { app, database } = await createTestAppAndDatabase();
    const needs = await createProject(app, 'House storage');
    const quiet = await createProject(app, 'Quiet garden');
    const quietTask = await createTask(app, { title: 'Water', projectId: quiet.id });
    await setNext(app, quiet.id, quietTask.id);
    const fresh = await createProject(app, 'Fresh edit');
    const freshTask = await createTask(app, { title: 'Rename me', projectId: fresh.id });
    await setNext(app, fresh.id, freshTask.id);
    await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${freshTask.id}`,
      headers: auth,
      payload: { title: 'Renamed today' },
    });
    const waiting = await createProject(app, 'Trusts');
    const waitingTask = await createTask(app, { title: 'Call Mike', projectId: waiting.id });
    await setNext(app, waiting.id, waitingTask.id);
    await setWaiting(app, waiting.id, 'Mike', '2026-09-23');
    const someday = await createProject(app, 'Umbrella');
    await app.inject({
      method: 'PUT',
      url: `/api/projects/${someday.id}/status`,
      headers: auth,
      payload: { status: 'someday' },
    });

    await database.execute({
      sql: `UPDATE projects SET created_at = ?, last_changed_at = ? WHERE id = ?`,
      args: ['2026-10-04T05:00:00.000Z', '2026-10-04T05:00:00.000Z', quiet.id],
    });
    await database.execute({
      sql: `UPDATE change_log SET occurred_at = ? WHERE project_id = ?`,
      args: ['2026-10-04T05:00:00.000Z', quiet.id],
    });

    const chicago = await app.inject({
      method: 'GET',
      url: '/api/review',
      headers: auth,
    });
    expect(chicago.statusCode).toBe(200);
    const body = chicago.json<ReviewPage>();
    expect(body.today).toBe('2026-10-11');
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.projects.map((item) => item.project.name)).toEqual([
      'House storage',
      'Quiet garden',
      'Trusts',
    ]);
    expect(body.projects.map((item) => item.reasons)).toEqual([
      ['noNextAction'],
      ['quiet'],
      ['waiting'],
    ]);
    expect(body.counts).toEqual({ noNextAction: 1, quiet: 1, waiting: 1 });
    expect(body.projects[0]?.project.id).toBe(needs.id);
    expect(body.projects.some((item) => item.project.id === fresh.id)).toBe(false);
    expect(body.projects.some((item) => item.project.id === someday.id)).toBe(false);

    const utc = await app.inject({
      method: 'GET',
      url: '/api/review?timeZone=UTC',
      headers: auth,
    });
    expect(utc.statusCode).toBe(200);
    expect(utc.json<ReviewPage>().today).toBe('2026-10-12');
  });

  it('counts noNextAction for active projects only', async () => {
    const app = await createTestApp();
    await createProject(app, 'House storage');
    const waitingNoNext = await createProject(app, 'Waiting empty');
    await setWaiting(app, waitingNoNext.id, 'Pat');

    const response = await app.inject({
      method: 'GET',
      url: '/api/review',
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<ReviewPage>();
    expect(body.counts).toEqual({ noNextAction: 1, quiet: 0, waiting: 1 });
    expect(
      body.projects.find((item) => item.project.id === waitingNoNext.id)?.reasons
    ).toEqual(['noNextAction', 'waiting']);
  });

  it('lets a bot token read the same body as a person token', async () => {
    const { app } = await createTestAppWithWebAuthnAndDatabase();
    await createProject(app, 'House storage');
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken } = minted.json<{ rawToken: string }>();

    const person = await app.inject({
      method: 'GET',
      url: '/api/review?timeZone=America/Chicago',
      headers: auth,
    });
    const bot = await app.inject({
      method: 'GET',
      url: '/api/review?timeZone=America/Chicago',
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(person.statusCode).toBe(200);
    expect(bot.statusCode).toBe(200);
    expect(bot.json<ReviewPage>().projects).toEqual(person.json<ReviewPage>().projects);
    expect(bot.json<ReviewPage>().counts).toEqual(person.json<ReviewPage>().counts);
  });

  it('pages with a stable total', async () => {
    const app = await createTestApp();
    await createProject(app, 'Alpha missing');
    await createProject(app, 'Bravo missing');
    const first = await app.inject({
      method: 'GET',
      url: '/api/review?limit=1',
      headers: auth,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json<ReviewPage>();
    expect(firstBody.projects).toHaveLength(1);
    expect(firstBody.total).toBe(2);
    expect(firstBody.hasMore).toBe(true);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await app.inject({
      method: 'GET',
      url: `/api/review?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor ?? '')}`,
      headers: auth,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json<ReviewPage>();
    expect(secondBody.projects).toHaveLength(1);
    expect(secondBody.total).toBe(2);
    expect(secondBody.hasMore).toBe(false);
    expect(secondBody.projects[0]?.project.id).not.toBe(firstBody.projects[0]?.project.id);
  });
});

const completeTask = async (app: FastifyInstance, taskId: string): Promise<Task> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/tasks/${taskId}/complete`,
    headers: auth,
    payload: {},
  });
  expect(response.statusCode).toBe(200);
  return response.json<Task>();
};

describe('GET /api/review/done', () => {
  it('returns 401 without a token', async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/review/done' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a Tuesday week as INVALID_WEEK', async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/review/done?week=2026-10-06',
      headers: auth,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'week must be a Monday',
      code: 'INVALID_WEEK',
    });
  });

  it('rejects a future Monday as INVALID_WEEK', async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/review/done?week=2026-10-12',
      headers: auth,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'week cannot be in the future',
      code: 'INVALID_WEEK',
    });
  });

  it('rejects a cursor from another view as invalid_cursor', async () => {
    const app = await createTestApp();
    const cursor = encodeKeysetCursor(
      workDueCursor.of({
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: TEST_ORG_ID,
        createdById: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Cursor',
        createdAt: '2026-10-12T01:00:00.000Z',
        dueDate: '2026-10-11',
        lastChangedAt: null,
        lastChangedBy: null,
        completedBy: null,
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/api/review/done?cursor=${encodeURIComponent(cursor)}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code?: string }>().code).toBe('invalid_cursor');
  });

  it('returns the 200 shape for the stored Chicago week and groups project tasks', async () => {
    const { app, database } = await createTestAppAndDatabase();
    const house = await createProject(app, 'House storage');
    const garden = await createProject(app, 'Garden');
    const houseTask = await createTask(app, { title: 'Box the attic', projectId: house.id });
    const gardenTask = await createTask(app, { title: 'Plant tomatoes', projectId: garden.id });
    const gardenNext = await createTask(app, { title: 'Water plants', projectId: garden.id });
    await setNext(app, garden.id, gardenNext.id);
    const loose = await createTask(app, { title: 'Milk' });
    const reopened = await createTask(app, { title: 'Undo me', projectId: house.id });
    await completeTask(app, houseTask.id);
    await completeTask(app, gardenTask.id);
    await completeTask(app, loose.id);
    await completeTask(app, reopened.id);
    await app.inject({
      method: 'POST',
      url: `/api/tasks/${reopened.id}/uncomplete`,
      headers: auth,
      payload: {},
    });
    await database.execute({
      sql: `UPDATE tasks SET completed_at = ? WHERE id = ?`,
      args: ['2026-10-10T16:12:00.000Z', houseTask.id],
    });
    await database.execute({
      sql: `UPDATE tasks SET completed_at = ? WHERE id = ?`,
      args: ['2026-10-11T15:00:00.000Z', gardenTask.id],
    });
    await database.execute({
      sql: `UPDATE tasks SET completed_at = ? WHERE id = ?`,
      args: ['2026-10-10T16:30:00.000Z', loose.id],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/review/done',
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<DoneListPage>();
    expect(body.timeZone).toBe('America/Chicago');
    expect(body.week).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(body.previousWeek).toBe('2026-09-28');
    expect(body.nextWeek).toBeNull();
    expect(body.groups.map((group) => group.project.name)).toEqual(['Garden', 'House storage']);
    expect(body.groups[0]?.nextAction).toEqual({ id: gardenNext.id, title: 'Water plants' });
    expect(body.groups[1]?.nextAction).toBeNull();
    expect(body.groups.some((group) => group.tasks.some((task) => task.id === reopened.id))).toBe(
      false
    );
    expect(body.otherTaskCount).toBe(1);
    expect(body.hasMore).toBe(false);
    expect(body.total).toBe(2);
  });

  it('defaults the week from a stored non-Chicago zone', async () => {
    const { app, database } = await createTestAppAndDatabase();
    await database.execute({
      sql: `UPDATE organizations SET time_zone = ? WHERE id = ?`,
      args: ['Pacific/Auckland', TEST_ORG_ID],
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/review/done',
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<DoneListPage>();
    expect(body.timeZone).toBe('Pacific/Auckland');
    expect(body.week).toEqual({ start: '2026-10-12', end: '2026-10-18' });
  });

  it('lets a bot token read the same body as a person token', async () => {
    const { app, database } = await createTestAppWithWebAuthnAndDatabase();
    const house = await createProject(app, 'House storage');
    const task = await createTask(app, { title: 'Box the attic', projectId: house.id });
    await completeTask(app, task.id);
    await database.execute({
      sql: `UPDATE tasks SET completed_at = ? WHERE id = ?`,
      args: ['2026-10-10T16:12:00.000Z', task.id],
    });
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken } = minted.json<{ rawToken: string }>();

    const person = await app.inject({
      method: 'GET',
      url: '/api/review/done?week=2026-10-05',
      headers: auth,
    });
    const bot = await app.inject({
      method: 'GET',
      url: '/api/review/done?week=2026-10-05',
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(person.statusCode).toBe(200);
    expect(bot.statusCode).toBe(200);
    expect(bot.json<DoneListPage>().groups).toEqual(person.json<DoneListPage>().groups);
    expect(bot.json<DoneListPage>().otherTaskCount).toBe(
      person.json<DoneListPage>().otherTaskCount
    );
  });

  it('pages finished tasks with a stable total', async () => {
    const { app, database } = await createTestAppAndDatabase();
    const house = await createProject(app, 'House storage');
    const firstTask = await createTask(app, { title: 'Older', projectId: house.id });
    const secondTask = await createTask(app, { title: 'Newer', projectId: house.id });
    await completeTask(app, firstTask.id);
    await completeTask(app, secondTask.id);
    await database.execute({
      sql: `UPDATE tasks SET completed_at = ? WHERE id = ?`,
      args: ['2026-10-08T16:00:00.000Z', firstTask.id],
    });
    await database.execute({
      sql: `UPDATE tasks SET completed_at = ? WHERE id = ?`,
      args: ['2026-10-10T16:00:00.000Z', secondTask.id],
    });

    const first = await app.inject({
      method: 'GET',
      url: '/api/review/done?limit=1',
      headers: auth,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json<DoneListPage>();
    expect(firstBody.groups[0]?.tasks).toHaveLength(1);
    expect(firstBody.total).toBe(2);
    expect(firstBody.hasMore).toBe(true);
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    const finishedNewer = firstBody.groups[0]?.tasks[0];
    expect(finishedNewer?.title).toBe('Newer');
    if (finishedNewer?.completedAt) {
      expect(firstBody.nextCursor).toBe(
        encodeKeysetCursor(
          doneListCursor.of({ ...finishedNewer, completedAt: finishedNewer.completedAt })
        )
      );
    }

    const second = await app.inject({
      method: 'GET',
      url: `/api/review/done?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor ?? '')}`,
      headers: auth,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json<DoneListPage>();
    expect(secondBody.groups[0]?.tasks[0]?.title).toBe('Older');
    expect(secondBody.total).toBe(2);
    expect(secondBody.hasMore).toBe(false);
  });
});
