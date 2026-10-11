import { describe, it, expect, beforeEach } from 'vitest';
import {
  HISTORY_STARTS_AT,
  type HistoryPage,
  type Project,
  type Task,
  type TaskListPage,
} from '@yoink/api-contracts';
import type { FastifyInstance } from 'fastify';
import { encodeKeysetCursor } from '../../listing/application/keyset-codec.js';
import {
  createTestApp,
  createTestAppAndDatabase,
  pagingTestConfig,
  TEST_ORG_ID,
  TEST_TOKEN,
  TEST_USER_ID,
} from '../../tests/helpers/test-app.js';

const auth = { authorization: `Bearer ${TEST_TOKEN}` };

const collectHistoryPages = async (
  app: FastifyInstance,
  path: string,
  limit: number
): Promise<{ pages: HistoryPage[]; kinds: string[] }> => {
  const pages: HistoryPage[] = [];
  const kinds: string[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore === true) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    const response = await app.inject({
      method: 'GET',
      url: `${path}?${qs.toString()}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<HistoryPage>();
    expect(body.nextCursor).toEqual(body.hasMore ? expect.any(String) : null);
    expect(body.historyStartsAt).toBe(HISTORY_STARTS_AT);
    pages.push(body);
    kinds.push(...body.entries.map((entry) => entry.kind));
    hasMore = body.hasMore;
    cursor = body.nextCursor;
    if (pages.length > 20) {
      throw new Error('history pagination did not terminate');
    }
  }

  return { pages, kinds };
};

describe('history HTTP list completeness', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp(pagingTestConfig);
  });

  const createProject = async (name: string): Promise<Project> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: auth,
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

  it('pages project history with hasMore, nextCursor, total, and historyStartsAt', async () => {
    const kitchen = await createProject('Kitchen');
    for (let index = 0; index < 5; index++) {
      await createTask({ title: `Pad ${String(index)}`, projectId: kitchen.id });
    }

    const first = await app.inject({
      method: 'GET',
      url: `/api/projects/${kitchen.id}/history?limit=3`,
      headers: auth,
    });
    expect(first.statusCode).toBe(200);
    const page = first.json<HistoryPage>();
    expect(Object.keys(page).sort()).toEqual(
      ['entries', 'hasMore', 'historyStartsAt', 'nextCursor', 'total'].sort()
    );
    expect(page.entries).toHaveLength(3);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.historyStartsAt).toBe(HISTORY_STARTS_AT);
    expect(page.total).toBeGreaterThan(3);

    const { pages, kinds } = await collectHistoryPages(
      app,
      `/api/projects/${kitchen.id}/history`,
      3
    );
    expect(pages[0]?.total).toBe(kinds.length);
    expect(pages.every((item) => item.total === kinds.length)).toBe(true);
    expect(pages[pages.length - 1]?.hasMore).toBe(false);
    expect(pages[pages.length - 1]?.nextCursor).toBeNull();
    expect(kinds[kinds.length - 1]).toBe('ProjectCreated');
    expect(kinds).toContain('TaskCreated');
  });

  it('rejects a garbage cursor and a cursor from another view', async () => {
    const kitchen = await createProject('Kitchen');

    const garbage = await app.inject({
      method: 'GET',
      url: `/api/projects/${kitchen.id}/history?cursor=not-a-cursor`,
      headers: auth,
    });
    expect(garbage.statusCode).toBe(400);
    expect(garbage.json<{ code: string }>()).toMatchObject({ code: 'invalid_cursor' });

    const wrongView = encodeKeysetCursor({
      view: 'history.task',
      keys: ['2026-10-11T12:00:00.000Z', 1],
    });
    const mismatch = await app.inject({
      method: 'GET',
      url: `/api/projects/${kitchen.id}/history?cursor=${wrongView}`,
      headers: auth,
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json<{ code: string }>()).toMatchObject({ code: 'invalid_cursor' });
  });

  it('pages task history including after delete', async () => {
    const kitchen = await createProject('Kitchen');
    const task = await createTask({ title: 'Old invoice', projectId: kitchen.id });
    await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { title: 'Old invoice edited' },
    });
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/tasks/${task.id}`,
      headers: auth,
    });
    expect(deleted.statusCode).toBe(204);

    const response = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/history`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const page = response.json<HistoryPage>();
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.historyStartsAt).toBe(HISTORY_STARTS_AT);
    expect(page.entries.map((entry) => entry.kind)).toEqual([
      'TaskDeleted',
      'TaskUpdated',
      'TaskCreated',
    ]);
    expect(page.entries[0]?.subject.deleted).toBe(true);
  });

  it('pages finished tasks newest completed first', async () => {
    const kitchen = await createProject('Kitchen');
    const first = await createTask({ title: 'Finish later A', projectId: kitchen.id });
    const second = await createTask({ title: 'Finish later B', projectId: kitchen.id });
    await createTask({ title: 'Still open', projectId: kitchen.id });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/tasks/${second.id}/complete`,
          headers: auth,
          payload: {},
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/tasks/${first.id}/complete`,
          headers: auth,
          payload: {},
        })
      ).statusCode
    ).toBe(200);

    const page = await app.inject({
      method: 'GET',
      url: `/api/projects/${kitchen.id}/tasks?status=finished&limit=1`,
      headers: auth,
    });
    expect(page.statusCode).toBe(200);
    const body = page.json<TaskListPage>();
    expect(body.tasks.map((task) => task.title)).toEqual(['Finish later A']);
    expect(body.hasMore).toBe(true);
    expect(body.total).toBe(2);
    expect(body.nextCursor).toEqual(expect.any(String));

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/projects/${kitchen.id}/tasks?status=finished&limit=1&cursor=${body.nextCursor}`,
      headers: auth,
    });
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json<TaskListPage>();
    expect(body2.tasks.map((task) => task.title)).toEqual(['Finish later B']);
    expect(body2.hasMore).toBe(false);
    expect(body2.nextCursor).toBeNull();
    expect(body2.total).toBe(2);
  });

  it('returns 404 for another org project and a missing task', async () => {
    const missingProject = await app.inject({
      method: 'GET',
      url: '/api/projects/00000000-0000-4000-8000-000000000099/history',
      headers: auth,
    });
    expect(missingProject.statusCode).toBe(404);
    expect(missingProject.json<{ code: string }>()).toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });

    const missingTask = await app.inject({
      method: 'GET',
      url: '/api/tasks/00000000-0000-4000-8000-000000000099/history',
      headers: auth,
    });
    expect(missingTask.statusCode).toBe(404);
    expect(missingTask.json<{ code: string }>()).toMatchObject({
      code: 'TASK_NOT_FOUND',
    });
  });
});

describe('history HTTP fixtures', () => {
  const nextSeq = async (database: { execute: (query: { sql: string }) => Promise<{ rows: Array<Record<string, unknown>> }> }) => {
    const result = await database.execute({
      sql: `SELECT COALESCE(MAX(seq), 0) AS seq FROM change_log`,
    });
    return Number(result.rows[0]?.seq ?? 0) + 1;
  };

  it('returns 200 Unknown for damaged JSON and counts that row', async () => {
    const { app, database } = await createTestAppAndDatabase();
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: auth,
      payload: { name: 'Damaged kitchen' },
    });
    expect(created.statusCode).toBe(201);
    const kitchen = created.json<Project>();
    const before = await app.inject({
      method: 'GET',
      url: `/api/projects/${kitchen.id}/history`,
      headers: auth,
    });
    expect(before.statusCode).toBe(200);
    const beforePage = before.json<HistoryPage>();

    await database.execute({
      sql: `
        INSERT INTO change_log (
          id, organization_id, project_id, subject_type, subject_id,
          kind, schema_version, payload_json, actor_user_id, actor_kind,
          occurred_at, hidden, seq
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        '00000000-0000-4000-8000-00000000d0d0',
        TEST_ORG_ID,
        kitchen.id,
        'project',
        kitchen.id,
        'ProjectUpdated',
        1,
        '{not-json',
        TEST_USER_ID,
        'user',
        '2026-10-12T12:00:00.000Z',
        0,
        await nextSeq(database),
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${kitchen.id}/history`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const page = response.json<HistoryPage>();
    expect(page.total).toBe(beforePage.total + 1);
    expect(page.entries.some((entry) => entry.kind === 'Unknown')).toBe(true);
    expect(page.entries.filter((entry) => entry.kind === 'Unknown')).toHaveLength(1);
  });

  it('exposes a ProjectImported fixture as Moved in · N on the project timeline', async () => {
    const { app, database } = await createTestAppAndDatabase();
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: auth,
      payload: { name: 'Imported garden' },
    });
    expect(created.statusCode).toBe(201);
    const garden = created.json<Project>();

    await database.execute({
      sql: `
        INSERT INTO change_log (
          id, organization_id, project_id, subject_type, subject_id,
          kind, schema_version, payload_json, actor_user_id, actor_kind,
          occurred_at, hidden, seq
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        '00000000-0000-4000-8000-00000000b0b0',
        TEST_ORG_ID,
        garden.id,
        'project',
        garden.id,
        'ProjectImported',
        1,
        JSON.stringify({ taskCount: 2 }),
        TEST_USER_ID,
        'user',
        '2026-10-12T12:00:00.000Z',
        0,
        await nextSeq(database),
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${garden.id}/history`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const page = response.json<HistoryPage>();
    const imported = page.entries.find((entry) => entry.kind === 'ProjectImported');
    expect(imported?.details).toEqual({ kind: 'ProjectImported', taskCount: 2 });
    expect(imported?.subject.type).toBe('project');
    expect(page.entries.some((entry) => entry.kind === 'Unknown')).toBe(false);
  });
});
