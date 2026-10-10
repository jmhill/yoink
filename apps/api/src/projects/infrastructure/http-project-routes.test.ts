import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestAppWithWebAuthn,
  TEST_TOKEN,
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_SESSION_ID,
  TEST_SESSION_COOKIE,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type { Project, ProjectListPage } from '@yoink/api-contracts';

describe('project HTTP routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestAppWithWebAuthn();
  });

  const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };
  const bearer = { authorization: `Bearer ${TEST_TOKEN}` };

  const createProject = async (
    payload: { name: string; objective?: string },
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: Project }> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      headers,
      payload,
    });
    return { status: response.statusCode, body: response.json<Project>() };
  };

  it('creates a project for a person session and lists the full set', async () => {
    const created = await createProject({ name: 'Garden', objective: 'Grow tomatoes' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Garden');
    expect(created.body.objective).toBe('Grow tomatoes');
    expect(created.body.status).toBe('active');
    expect(created.body.organizationId).toBe(TEST_ORG_ID);
    expect(created.body.createdById).toBe(TEST_USER_ID);
    expect(created.body.lastChangedAt).toBeTruthy();
    expect(created.body.lastChangedBy).toBe(TEST_USER_ID);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: bearer,
    });
    expect(listed.statusCode).toBe(200);
    const page = listed.json<ProjectListPage>();
    expect(page.projects.map((project) => project.name)).toEqual(['Garden']);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.total).toBe(1);
  });

  it('creates a project for a person token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: bearer,
      payload: { name: 'Token garden' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<Project>().name).toBe('Token garden');
  });

  it('reads one project by id', async () => {
    const created = await createProject({ name: 'Garden' });
    expect(created.status).toBe(201);

    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${created.body.id}`,
      headers: bearer,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<Project>().name).toBe('Garden');
  });

  it('edits name and objective', async () => {
    const created = await createProject({ name: 'Garden', objective: 'Grow tomatoes' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${created.body.id}`,
      headers: bearer,
      payload: { name: 'Backyard', objective: 'Plant herbs' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Project>();
    expect(body.name).toBe('Backyard');
    expect(body.objective).toBe('Plant herbs');
    expect(body.lastChangedBy).toBe(TEST_USER_ID);
  });

  it('returns 403 when an agent token tries to create', async () => {
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken } = minted.json<{ rawToken: string }>();

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { name: 'Bot garden' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: 'Creating a project requires a person' });
  });

  it('lets an agent token edit a project', async () => {
    const created = await createProject({ name: 'Garden' });
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Project editor' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken, agent } = minted.json<{
      rawToken: string;
      agent: { userId: string };
    }>();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${created.body.id}`,
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { name: 'Lane garden', objective: 'Brief Justin' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Project>();
    expect(body.name).toBe('Lane garden');
    expect(body.objective).toBe('Brief Justin');
    expect(body.lastChangedBy).toBe(agent.userId);
  });

  it('rejects a duplicate name ignoring case', async () => {
    expect((await createProject({ name: 'Garden' })).status).toBe(201);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      payload: { name: 'garden' },
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({
      message: 'A project with this name already exists',
    });
  });

  it('returns 404 for an unknown project', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/550e8400-e29b-41d4-a716-446655440099',
      headers: bearer,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Project not found' });
  });

  it('returns 401 without authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
    });
    expect(response.statusCode).toBe(401);
  });
});
