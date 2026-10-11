import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestAppWithWebAuthn,
  TEST_TOKEN,
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type {
  AppliedImport,
  HistoryPage,
  ImportProject,
  Project,
  StagedImport,
  StagedImportList,
  Task,
} from '@yoink/api-contracts';
import { buildObsidianUrl } from '../domain/notebook-pages.js';

describe('project import HTTP', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestAppWithWebAuthn();
  });

  const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };
  const bearer = { authorization: `Bearer ${TEST_TOKEN}` };

  const createTask = async (payload: {
    title: string;
    dueDate?: string;
    assigneeId?: string;
  }): Promise<Task> => {
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

  const threeProjectBatch = async (): Promise<{
    paint: Task;
    hinges: Task;
    hook: Task;
    projects: ImportProject[];
  }> => {
    const paint = await createTask({ title: 'Paint the door' });
    const hinges = await createTask({ title: 'Order hinges', dueDate: '2026-11-01' });
    const hook = await createTask({ title: 'Hang the hook' });
    return {
      paint,
      hinges,
      hook,
      projects: [
        {
          name: 'Harbor shed',
          objective: 'Keep the dock usable',
          status: 'active',
          notebookPages: ['notes/Harbor shed (dock).md', 'notes/Harbor shed winter.md'],
          existingTaskIds: [paint.id, hinges.id, hook.id],
          nextAction: { existingTaskId: paint.id },
        },
        {
          name: 'Permit desk',
          objective: 'Get the slip approved',
          status: 'waiting',
          waitingOn: 'City hall',
          waitingSince: null,
          newTasks: [
            {
              key: 'call-clerk',
              title: 'Call the clerk',
              assigneeId: '00000000-0000-4000-8000-000000000099',
            },
          ],
          nextAction: { newTaskKey: 'call-clerk' },
        },
        {
          name: 'Winter boat cover',
          status: 'someday',
          newTasks: [{ key: 'measure', title: 'Measure the cockpit' }],
        },
      ],
    };
  };

  it('lets a bot stage a valid batch and a person apply it', async () => {
    const { paint, hinges, hook, projects } = await threeProjectBatch();
    const bot = await mintBot('Lane');

    const staged = await app.inject({
      method: 'POST',
      url: '/api/projects/imports',
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: { projects },
    });
    expect(staged.statusCode).toBe(201);
    const stagedBody = staged.json<StagedImport>();
    expect(stagedBody.status).toBe('pending');
    expect(stagedBody.createdByName).toBe('Lane');
    expect(stagedBody.preview?.totals).toEqual({
      projectCount: 3,
      existingTaskCount: 3,
      newTaskCount: 2,
      projectsWithNoNextAction: 1,
    });
    expect(stagedBody.preview?.projects.map((entry) => entry.name)).toEqual([
      'Harbor shed',
      'Permit desk',
      'Winter boat cover',
    ]);
    expect(stagedBody.preview?.projects[1]?.warnings).toEqual([
      {
        field: 'newTasks.0.assigneeId',
        code: 'ASSIGNEE_NOT_IN_ORGANIZATION',
        message: 'Assignee is not a member; this task will import unassigned',
      },
    ]);
    expect(stagedBody.preview?.projects[1]?.waitingSince).toBeNull();
    expect(stagedBody.preview?.projects[0]?.notebookPages).toEqual([
      {
        path: 'notes/Harbor shed (dock).md',
        url: buildObsidianUrl('notes/Harbor shed (dock).md'),
      },
      {
        path: 'notes/Harbor shed winter.md',
        url: buildObsidianUrl('notes/Harbor shed winter.md'),
      },
    ]);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/projects/imports',
      headers: { authorization: `Bearer ${bot.rawToken}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<StagedImportList>().imports.map((item) => item.id)).toEqual([
      stagedBody.id,
    ]);

    const botApply = await app.inject({
      method: 'POST',
      url: `/api/projects/imports/${stagedBody.id}/apply`,
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: {},
    });
    expect(botApply.statusCode).toBe(403);
    expect(botApply.json()).toEqual({
      message: 'Applying or discarding an import requires a person',
      code: 'IMPORT_REQUIRES_PERSON',
    });

    const applied = await app.inject({
      method: 'POST',
      url: `/api/projects/imports/${stagedBody.id}/apply`,
      cookies: session.cookies,
      payload: {},
    });
    expect(applied.statusCode).toBe(200);
    const appliedBody = applied.json<AppliedImport>();
    expect(appliedBody.status).toBe('applied');
    expect(appliedBody.projects.map((project) => project.name)).toEqual([
      'Harbor shed',
      'Permit desk',
      'Winter boat cover',
    ]);

    const harbor = appliedBody.projects[0];
    const permit = appliedBody.projects[1];
    const cover = appliedBody.projects[2];
    expect(harbor && permit && cover).toBeTruthy();
    if (!harbor || !permit || !cover) {
      return;
    }

    const harborGet = await app.inject({
      method: 'GET',
      url: `/api/projects/${harbor.id}`,
      headers: bearer,
    });
    expect(harborGet.statusCode).toBe(200);
    const harborProject = harborGet.json<Project>();
    expect(harborProject.status).toBe('active');
    expect(harborProject.nextActionTaskId).toBe(paint.id);
    expect(harborProject.notebookPages).toEqual(harbor.notebookPages);
    expect(harborProject.createdById).toBe(TEST_USER_ID);

    const permitGet = await app.inject({
      method: 'GET',
      url: `/api/projects/${permit.id}`,
      headers: bearer,
    });
    const permitProject = permitGet.json<Project>();
    expect(permitProject.status).toBe('waiting');
    expect(permitProject.waitingOn).toBe('City hall');
    expect(permitProject.waitingSince).toBeNull();
    expect(permitProject.nextActionTaskId).toBeTruthy();

    const coverGet = await app.inject({
      method: 'GET',
      url: `/api/projects/${cover.id}`,
      headers: bearer,
    });
    expect(coverGet.json<Project>().nextActionTaskId).toBeNull();

    const movedPaint = await app.inject({
      method: 'GET',
      url: `/api/tasks/${paint.id}`,
      headers: bearer,
    });
    const paintTask = movedPaint.json<Task>();
    expect(paintTask.projectId).toBe(harbor.id);
    expect(paintTask.dueDate).toBeUndefined();

    const movedHinges = await app.inject({
      method: 'GET',
      url: `/api/tasks/${hinges.id}`,
      headers: bearer,
    });
    expect(movedHinges.json<Task>().dueDate).toBe('2026-11-01');

    const clerk = await app.inject({
      method: 'GET',
      url: `/api/tasks/${permit.nextActionTaskId}`,
      headers: bearer,
    });
    const clerkTask = clerk.json<Task>();
    expect(clerkTask.title).toBe('Call the clerk');
    expect(clerkTask.assigneeId).toBeUndefined();
    expect(clerkTask.projectId).toBe(permit.id);

    const harborHistory = await app.inject({
      method: 'GET',
      url: `/api/projects/${harbor.id}/history?limit=1`,
      headers: bearer,
    });
    expect(harborHistory.statusCode).toBe(200);
    const harborPage = harborHistory.json<HistoryPage>();
    expect(harborPage.total).toBe(1);
    expect(harborPage.hasMore).toBe(false);
    expect(harborPage.nextCursor).toBeNull();
    expect(harborPage.entries).toHaveLength(1);
    expect(harborPage.entries[0]?.kind).toBe('ProjectImported');
    expect(harborPage.entries[0]?.actor.userId).toBe(TEST_USER_ID);
    expect(harborPage.entries[0]?.actor.kind).toBe('user');
    expect(harborPage.entries[0]?.details).toEqual({
      kind: 'ProjectImported',
      taskCount: 3,
    });

    const paintHistory = await app.inject({
      method: 'GET',
      url: `/api/tasks/${paint.id}/history`,
      headers: bearer,
    });
    const paintEntries = paintHistory.json<HistoryPage>().entries;
    expect(paintEntries.map((entry) => entry.kind)).toEqual([
      'TaskAddedToProject',
      'TaskCreated',
    ]);
    expect(paintEntries[0]?.details).toEqual({
      kind: 'TaskAddedToProject',
      projectId: harbor.id,
      projectName: 'Harbor shed',
      via: 'import',
    });

    const clerkHistory = await app.inject({
      method: 'GET',
      url: `/api/tasks/${clerkTask.id}/history`,
      headers: bearer,
    });
    const clerkEntries = clerkHistory.json<HistoryPage>().entries;
    expect(clerkEntries.map((entry) => entry.kind)).toEqual(['TaskCreated']);
    expect(clerkEntries[0]?.details).toEqual({
      kind: 'TaskCreated',
      via: 'import',
      projectName: 'Permit desk',
    });

    const later = await app.inject({
      method: 'POST',
      url: `/api/tasks/${paint.id}/complete`,
      cookies: session.cookies,
      payload: {},
    });
    expect(later.statusCode).toBe(200);
    const afterComplete = await app.inject({
      method: 'GET',
      url: `/api/projects/${harbor.id}/history`,
      headers: bearer,
    });
    const afterKinds = afterComplete.json<HistoryPage>().entries.map((entry) => entry.kind);
    expect(afterKinds[afterKinds.length - 1]).toBe('ProjectImported');
    expect(afterKinds).toContain('TaskCompleted');

    const double = await app.inject({
      method: 'POST',
      url: `/api/projects/imports/${stagedBody.id}/apply`,
      cookies: session.cookies,
      payload: {},
    });
    expect(double.statusCode).toBe(409);
    expect(double.json()).toEqual({
      message: 'This import is no longer pending',
      code: 'IMPORT_NOT_PENDING',
    });

    void hook;
  });

  it('refuses an invalid batch at staging and stores nothing', async () => {
    const staged = await app.inject({
      method: 'POST',
      url: '/api/projects/imports',
      cookies: session.cookies,
      payload: {
        projects: [
          { name: '   ', status: 'active' },
          { name: 'Harbor shed', status: 'done' },
        ],
      },
    });
    expect(staged.statusCode).toBe(400);
    expect(staged.json()).toEqual({
      message: 'The import batch is invalid',
      code: 'IMPORT_INVALID',
      errors: [
        {
          index: 0,
          name: '   ',
          field: 'name',
          code: 'PROJECT_NAME_BLANK',
          message: "Name can't be blank",
        },
        {
          index: 1,
          name: 'Harbor shed',
          field: 'status',
          code: 'INVALID_PROJECT_STATUS',
          message: 'Imported projects cannot be done or proposed',
        },
      ],
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/projects/imports',
      cookies: session.cookies,
    });
    expect(listed.json<StagedImportList>().imports).toEqual([]);

    const projects = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: bearer,
    });
    expect(projects.json<{ projects: Project[] }>().projects).toEqual([]);
  });

  it('refuses apply when data drifted and leaves the import pending', async () => {
    const { projects } = await threeProjectBatch();
    const staged = await app.inject({
      method: 'POST',
      url: '/api/projects/imports',
      cookies: session.cookies,
      payload: { projects },
    });
    expect(staged.statusCode).toBe(201);
    const id = staged.json<StagedImport>().id;

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      payload: { name: 'Harbor shed' },
    });
    expect(conflict.statusCode).toBe(201);

    const apply = await app.inject({
      method: 'POST',
      url: `/api/projects/imports/${id}/apply`,
      cookies: session.cookies,
      payload: {},
    });
    expect(apply.statusCode).toBe(400);
    expect(apply.json()).toEqual({
      message: 'The import batch is invalid',
      code: 'IMPORT_INVALID',
      errors: [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'name',
          code: 'DUPLICATE_PROJECT_NAME',
          message: 'A project with this name already exists',
        },
      ],
    });

    const preview = await app.inject({
      method: 'GET',
      url: `/api/projects/imports/${id}`,
      cookies: session.cookies,
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json<StagedImport>();
    expect(body.status).toBe('pending');
    expect(body.preview).toBeNull();
    expect(body.errors).toEqual([
      {
        index: 0,
        name: 'Harbor shed',
        field: 'name',
        code: 'DUPLICATE_PROJECT_NAME',
        message: 'A project with this name already exists',
      },
    ]);
  });

  it('lets a person discard a pending import and refuses a second discard', async () => {
    const { projects } = await threeProjectBatch();
    const bot = await mintBot('Lane');
    const staged = await app.inject({
      method: 'POST',
      url: '/api/projects/imports',
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: { projects },
    });
    const id = staged.json<StagedImport>().id;

    const botDiscard = await app.inject({
      method: 'POST',
      url: `/api/projects/imports/${id}/discard`,
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: {},
    });
    expect(botDiscard.statusCode).toBe(403);

    const discarded = await app.inject({
      method: 'POST',
      url: `/api/projects/imports/${id}/discard`,
      cookies: session.cookies,
      payload: {},
    });
    expect(discarded.statusCode).toBe(200);
    expect(discarded.json()).toMatchObject({
      id,
      status: 'discarded',
      decidedById: TEST_USER_ID,
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/projects/imports',
      cookies: session.cookies,
    });
    expect(listed.json<StagedImportList>().imports).toEqual([]);

    const again = await app.inject({
      method: 'POST',
      url: `/api/projects/imports/${id}/discard`,
      cookies: session.cookies,
      payload: {},
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('IMPORT_NOT_PENDING');
  });

  it('lets a bot replace notebook pages and no-ops the same list', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      payload: { name: 'Harbor shed' },
    });
    const project = created.json<Project>();
    const bot = await mintBot('Lane');

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}`,
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: { notebookPages: ['notes/Harbor shed (dock).md'] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<Project>().notebookPages).toEqual([
      {
        path: 'notes/Harbor shed (dock).md',
        url: buildObsidianUrl('notes/Harbor shed (dock).md'),
      },
    ]);

    const again = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}`,
      headers: { authorization: `Bearer ${bot.rawToken}` },
      payload: { notebookPages: ['notes/Harbor shed (dock).md'] },
    });
    expect(again.statusCode).toBe(200);

    const history = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/history`,
      headers: bearer,
    });
    expect(history.json<HistoryPage>().entries.map((entry) => entry.kind)).toEqual([
      'ProjectUpdated',
      'ProjectCreated',
    ]);
    expect(history.json<HistoryPage>().entries[0]?.details).toEqual({
      kind: 'ProjectUpdated',
      notebookPages: ['notes/Harbor shed (dock).md'],
    });
  });
});
