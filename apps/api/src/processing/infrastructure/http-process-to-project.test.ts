import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_OBJECTIVE_MAX_LENGTH,
  type Capture,
  type Project,
  type Task,
} from '@yoink/api-contracts';
import {
  createTestAppWithWebAuthn,
  TEST_TOKEN,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
} from '../../tests/helpers/test-app.js';

describe('POST /api/captures/:id/process-to-project', () => {
  let app: FastifyInstance;
  const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };
  const bearer = { authorization: `Bearer ${TEST_TOKEN}` };

  beforeEach(async () => {
    app = await createTestAppWithWebAuthn();
  });

  const createCapture = async (payload: {
    content: string;
    sourceUrl?: string;
  }): Promise<Capture> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: bearer,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json<Capture>();
  };

  it('returns the project and processed capture for a person', async () => {
    const capture = await createCapture({ content: 'Harbor shed' });
    const response = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process-to-project`,
      cookies: session.cookies,
      payload: { name: 'Harbor', objective: 'Fix the door', status: 'active' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ project: Project; capture: Capture }>();
    expect(body.project.name).toBe('Harbor');
    expect(body.project.objective).toBe('Fix the door');
    expect(body.project.status).toBe('active');
    expect(body.capture.status).toBe('processed');
    expect(body.capture.processedToType).toBe('project');
    expect(body.capture.processedToId).toBe(body.project.id);
  });

  it('creates a someday project in one write', async () => {
    const capture = await createCapture({ content: 'Later idea' });
    const response = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process-to-project`,
      headers: bearer,
      payload: { name: 'Someday shed', status: 'someday' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ project: Project }>().project.status).toBe('someday');
  });

  it('refuses a bot and writes nothing', async () => {
    const capture = await createCapture({ content: 'Bot clip' });
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${capture.organizationId}/agents`,
      cookies: session.cookies,
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken } = minted.json<{ rawToken: string }>();

    const response = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process-to-project`,
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { name: 'Bot garden', status: 'active' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      message: 'Creating a project requires a person',
      code: 'PROJECT_CREATE_REQUIRES_PERSON',
    });

    const still = await app.inject({
      method: 'GET',
      url: `/api/captures/${capture.id}`,
      headers: bearer,
    });
    expect(still.json<Capture>().status).toBe('inbox');

    const projects = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: bearer,
    });
    expect(projects.json<{ projects: Project[] }>().projects).toHaveLength(0);
  });

  it('returns 409 on a duplicate name and leaves the capture in the inbox', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: bearer,
      payload: { name: 'Garden' },
    });
    const capture = await createCapture({ content: 'Another garden' });
    const response = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process-to-project`,
      headers: bearer,
      payload: { name: 'Garden', status: 'active' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'DUPLICATE_PROJECT_NAME' });
    const still = await app.inject({
      method: 'GET',
      url: `/api/captures/${capture.id}`,
      headers: bearer,
    });
    expect(still.json<Capture>().status).toBe('inbox');
  });

  it('returns 409 and creates no project when the capture is not in the inbox', async () => {
    const capture = await createCapture({ content: 'Trash me first' });
    await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/trash`,
      headers: bearer,
      payload: {},
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process-to-project`,
      headers: bearer,
      payload: { name: 'Gone', status: 'active' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'CAPTURE_NOT_IN_INBOX' });

    const projects = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: bearer,
    });
    expect(projects.json<{ projects: Project[] }>().projects).toHaveLength(0);
  });

  const expectStillInboxAndNoProject = async (captureId: string) => {
    const still = await app.inject({
      method: 'GET',
      url: `/api/captures/${captureId}`,
      headers: bearer,
    });
    expect(still.json<Capture>().status).toBe('inbox');
    const projects = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: bearer,
    });
    expect(projects.json<{ projects: Project[] }>().projects).toHaveLength(0);
  };

  it('returns PROJECT_NAME_BLANK for a blank name and writes nothing', async () => {
    const capture = await createCapture({ content: 'Blank name' });
    const response = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process-to-project`,
      headers: bearer,
      payload: { name: '   ', status: 'active' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'PROJECT_NAME_BLANK' });
    await expectStillInboxAndNoProject(capture.id);
  });

  it('returns INVALID_PROJECT_NAME for a 201-character name and writes nothing', async () => {
    const capture = await createCapture({ content: 'Long name' });
    const response = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process-to-project`,
      headers: bearer,
      payload: { name: 'A'.repeat(PROJECT_NAME_MAX_LENGTH + 1), status: 'active' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_PROJECT_NAME' });
    await expectStillInboxAndNoProject(capture.id);
  });

  it('returns VALIDATION_FAILED for a 2001-character objective and writes nothing', async () => {
    const capture = await createCapture({ content: 'Long objective' });
    const response = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process-to-project`,
      headers: bearer,
      payload: {
        name: 'Harbor',
        objective: 'O'.repeat(PROJECT_OBJECTIVE_MAX_LENGTH + 1),
        status: 'active',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    await expectStillInboxAndNoProject(capture.id);
  });

  it('keeps process-to-task byte-identical for a bot token', async () => {
    const capture = await createCapture({ content: 'Need milk' });
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${capture.organizationId}/agents`,
      cookies: session.cookies,
      payload: { name: 'Task bot' },
    });
    const { rawToken } = minted.json<{ rawToken: string }>();

    const response = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process`,
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { type: 'task', data: {} },
    });

    expect(response.statusCode).toBe(201);
    const task = response.json<Task>();
    expect(task.title).toBe('Need milk');
    expect(task.captureId).toBe(capture.id);
    expect(task.listId).toBeUndefined();
  });
});
