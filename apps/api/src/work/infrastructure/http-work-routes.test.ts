import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Project, Task, WorkListsPage, WorkNextActionsPage } from '@yoink/api-contracts';
import { encodeKeysetCursor } from '../../listing/application/keyset-codec.js';
import { workDueCursor } from '../../listing/domain/list-keys.js';
import { createTestApp, TEST_TOKEN, TEST_USER_ID } from '../../tests/helpers/test-app.js';

describe('GET /api/work', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  const auth = { authorization: `Bearer ${TEST_TOKEN}` };

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

  const createTask = async (payload: {
    title: string;
    dueDate?: string;
    assigneeId?: string;
    projectId?: string;
    listId?: string;
  }): Promise<Task> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: auth,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json<Task>();
  };

  const setNext = async (projectId: string, taskId: string): Promise<void> => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/next-action`,
      headers: auth,
      payload: { taskId },
    });
    expect(response.statusCode).toBe(200);
  };

  it('returns next actions in dated-then-name order and respects owner=me', async () => {
    const alpha = await createProject('Alpha');
    const bravo = await createProject('Bravo');
    const alice = await createTask({
      title: 'Alpha next',
      dueDate: '2025-01-13',
      assigneeId: TEST_USER_ID,
      projectId: alpha.id,
    });
    const unowned = await createTask({
      title: 'Bravo next',
      dueDate: '2025-01-20',
      projectId: bravo.id,
    });
    await setNext(alpha.id, alice.id);
    await setNext(bravo.id, unowned.id);

    const everyone = await app.inject({
      method: 'GET',
      url: '/api/work/next-actions',
      headers: auth,
    });
    expect(everyone.statusCode).toBe(200);
    const everyoneBody = everyone.json<WorkNextActionsPage>();
    expect(everyoneBody.items.map((item) => item.task.id)).toEqual([alice.id, unowned.id]);
    expect(everyoneBody.items.map((item) => item.project.name)).toEqual(['Alpha', 'Bravo']);
    expect(everyoneBody.hasMore).toBe(false);
    expect(everyoneBody.nextCursor).toBeNull();
    expect(everyoneBody.total).toBe(2);

    const mine = await app.inject({
      method: 'GET',
      url: '/api/work/next-actions?owner=me',
      headers: auth,
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json<WorkNextActionsPage>().items.map((item) => item.task.id)).toEqual([
      alice.id,
    ]);
  });

  it('lists Due as today-or-earlier minus shown next actions', async () => {
    const alpha = await createProject('Alpha');
    const next = await createTask({
      title: 'Shown next',
      dueDate: '2025-01-13',
      projectId: alpha.id,
    });
    await setNext(alpha.id, next.id);
    const leftover = await createTask({
      title: 'In-project leftover',
      dueDate: '2025-01-14',
      projectId: alpha.id,
    });
    const loose = await createTask({
      title: 'Loose overdue',
      dueDate: '2025-01-11',
    });
    await createTask({
      title: 'Future loose',
      dueDate: '2025-01-25',
    });

    const due = await app.inject({
      method: 'GET',
      url: '/api/work/due',
      headers: auth,
    });
    expect(due.statusCode).toBe(200);
    const body = due.json<{ tasks: Task[]; total: number }>();
    expect(body.tasks.map((task) => task.id)).toEqual([loose.id, leftover.id]);
    expect(body.total).toBe(2);
  });

  it('uses America/Chicago at 8pm UTC the next calendar day when today is omitted', async () => {
    await createTask({ title: 'Chicago today', dueDate: '2026-10-11' });
    await createTask({ title: 'UTC tomorrow', dueDate: '2026-10-12' });

    const chicago = await app.inject({
      method: 'GET',
      url: '/api/work/due?today=2026-10-11',
      headers: auth,
    });
    expect(chicago.statusCode).toBe(200);
    expect(chicago.json<{ tasks: Task[] }>().tasks.map((task) => task.title)).toEqual([
      'Chicago today',
    ]);

    const utc = await app.inject({
      method: 'GET',
      url: '/api/work/due?today=2026-10-12',
      headers: auth,
    });
    expect(utc.json<{ tasks: Task[] }>().tasks.map((task) => task.title)).toEqual([
      'Chicago today',
      'UTC tomorrow',
    ]);
  });

  it('returns named lists with open counts plus Unlisted', async () => {
    const chores = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: auth,
      payload: { name: 'Chores' },
    });
    expect(chores.statusCode).toBe(201);
    const choresId = chores.json<{ id: string }>().id;
    await createTask({ title: 'On chores', listId: choresId });
    await createTask({ title: 'Unlisted open' });

    const lists = await app.inject({
      method: 'GET',
      url: '/api/work/lists',
      headers: auth,
    });
    expect(lists.statusCode).toBe(200);
    const body = lists.json<WorkListsPage>();
    expect(body.lists.map((list) => [list.id, list.name, list.openTaskCount])).toEqual([
      [choresId, 'Chores', 1],
    ]);
    expect(body.unlisted.openTaskCount).toBe(1);
    expect(body.total).toBe(1);
  });

  it('rejects a bogus owner and a cursor from the other Now view', async () => {
    const bogus = await app.inject({
      method: 'GET',
      url: '/api/work/next-actions?owner=bogus',
      headers: auth,
    });
    expect(bogus.statusCode).toBe(400);

    const dueCursor = encodeKeysetCursor(
      workDueCursor.of({
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: '550e8400-e29b-41d4-a716-446655440001',
        createdById: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Cursor',
        createdAt: '2025-01-15T10:00:00.000Z',
        dueDate: '2025-01-14',
        lastChangedAt: null,
        lastChangedBy: null,
        completedBy: null,
      })
    );
    const crossed = await app.inject({
      method: 'GET',
      url: `/api/work/next-actions?cursor=${encodeURIComponent(dueCursor)}`,
      headers: auth,
    });
    expect(crossed.statusCode).toBe(400);
    expect(crossed.json<{ code?: string }>().code).toBe('invalid_cursor');
  });

  it('returns 401 without authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/work/next-actions',
    });
    expect(response.statusCode).toBe(401);
  });
});
