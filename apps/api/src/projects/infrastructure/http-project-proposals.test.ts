import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestAppWithWebAuthn,
  TEST_SESSION_ID,
  TEST_SESSION_COOKIE,
  TEST_ORG_ID,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type { Project, ProjectListPage, SetProjectNextActionResponse } from '@yoink/api-contracts';

describe('project proposal HTTP routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestAppWithWebAuthn();
  });

  const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };

  const mintLane = async () => {
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    return minted.json<{ rawToken: string; agent: { userId: string } }>();
  };

  it('lets a bot propose and refuses bot create without proposed', async () => {
    const { rawToken } = await mintLane();

    const proposed = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: {
        name: 'Harbor shed',
        status: 'proposed',
        reason: 'Dock needs work',
        suggestedNextAction: 'Call the mill',
      },
    });
    expect(proposed.statusCode).toBe(201);
    const body = proposed.json<Project>();
    expect(body.status).toBe('proposed');
    expect(body.reason).toBe('Dock needs work');
    expect(body.suggestedNextAction).toBe('Call the mill');

    const active = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { name: 'Bot garden' },
    });
    expect(active.statusCode).toBe(403);
    expect(active.json()).toEqual({
      message: 'Creating a project requires a person',
      code: 'PROJECT_CREATE_REQUIRES_PERSON',
    });
  });

  it('hides proposals from the default list and returns them with status filter', async () => {
    const { rawToken, agent } = await mintLane();
    const proposed = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { name: 'Harbor shed', status: 'proposed' },
    });
    expect(proposed.statusCode).toBe(201);

    const garden = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      payload: { name: 'Garden' },
    });
    expect(garden.statusCode).toBe(201);

    const defaultList = await app.inject({
      method: 'GET',
      url: '/api/projects',
      cookies: session.cookies,
    });
    expect(defaultList.statusCode).toBe(200);
    const defaultPage = defaultList.json<ProjectListPage>();
    expect(defaultPage.projects.map((project) => project.name)).toEqual(['Garden']);

    const botList = await app.inject({
      method: 'GET',
      url: '/api/projects?status=proposed,declined',
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(botList.statusCode).toBe(200);
    const botPage = botList.json<ProjectListPage>();
    expect(botPage.projects.map((project) => project.name)).toEqual(['Harbor shed']);
    expect(botPage.projects[0]?.createdById).toBe(agent.userId);

    const personProposed = await app.inject({
      method: 'GET',
      url: '/api/projects?status=proposed',
      cookies: session.cookies,
    });
    expect(personProposed.json<ProjectListPage>().total).toBe(1);
  });

  it('lets a bot list its pending and declined proposals in one call', async () => {
    const lane = await mintLane();
    const pat = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Pat' },
    });
    expect(pat.statusCode).toBe(201);
    const patBody = pat.json<{ rawToken: string; agent: { userId: string } }>();

    const harbor = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${lane.rawToken}` },
      payload: { name: 'Harbor shed', status: 'proposed' },
    });
    expect(harbor.statusCode).toBe(201);

    const dock = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${lane.rawToken}` },
      payload: { name: 'Dock', status: 'proposed' },
    });
    expect(dock.statusCode).toBe(201);
    const dockId = dock.json<Project>().id;

    const turnedDown = await app.inject({
      method: 'POST',
      url: `/api/projects/${dockId}/decline`,
      cookies: session.cookies,
      payload: {},
    });
    expect(turnedDown.statusCode).toBe(200);

    const other = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${patBody.rawToken}` },
      payload: { name: 'Pat proposal', status: 'proposed' },
    });
    expect(other.statusCode).toBe(201);

    const garden = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      payload: { name: 'Garden' },
    });
    expect(garden.statusCode).toBe(201);

    const laneList = await app.inject({
      method: 'GET',
      url: '/api/projects?status=proposed,declined',
      headers: { authorization: `Bearer ${lane.rawToken}` },
    });
    expect(laneList.statusCode).toBe(200);
    const lanePage = laneList.json<ProjectListPage>();
    expect(lanePage.projects.map((project) => project.name).sort()).toEqual(['Dock', 'Harbor shed']);
    expect(lanePage.projects.every((project) => project.createdById === lane.agent.userId)).toBe(
      true
    );

    const personAll = await app.inject({
      method: 'GET',
      url: '/api/projects?status=proposed,declined',
      cookies: session.cookies,
    });
    expect(personAll.json<ProjectListPage>().projects.map((project) => project.name).sort()).toEqual(
      ['Dock', 'Harbor shed', 'Pat proposal']
    );

    const personLane = await app.inject({
      method: 'GET',
      url: `/api/projects?status=proposed,declined&createdById=${lane.agent.userId}`,
      cookies: session.cookies,
    });
    expect(personLane.json<ProjectListPage>().projects.map((project) => project.name).sort()).toEqual(
      ['Dock', 'Harbor shed']
    );

    const bad = await app.inject({
      method: 'GET',
      url: '/api/projects?status=proposed,nope',
      headers: { authorization: `Bearer ${lane.rawToken}` },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ code: 'INVALID_PROJECT_STATUS' });
  });

  it('lets a person confirm to active and create the suggested next action', async () => {
    const { rawToken } = await mintLane();
    const proposed = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: {
        name: 'Harbor shed',
        status: 'proposed',
        suggestedNextAction: 'Call the mill',
      },
    });
    const id = proposed.json<Project>().id;

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/confirm`,
      cookies: session.cookies,
      payload: { status: 'active' },
    });
    expect(confirmed.statusCode).toBe(200);
    const body = confirmed.json<SetProjectNextActionResponse>();
    expect(body.project.status).toBe('active');
    expect(body.task?.title).toBe('Call the mill');
    expect(body.project.nextActionTaskId).toBe(body.task?.id);
  });

  it('lets a person decline, frees the name, and restores', async () => {
    const { rawToken } = await mintLane();
    const proposed = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { name: 'Harbor shed', status: 'proposed' },
    });
    const id = proposed.json<Project>().id;

    const declined = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/decline`,
      cookies: session.cookies,
      payload: {},
    });
    expect(declined.statusCode).toBe(200);
    expect(declined.json<Project>().status).toBe('declined');

    const reuse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      payload: { name: 'Harbor shed' },
    });
    expect(reuse.statusCode).toBe(201);

    const restore = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/restore`,
      cookies: session.cookies,
      payload: {},
    });
    expect(restore.statusCode).toBe(409);
    expect(restore.json()).toMatchObject({ code: 'DUPLICATE_PROJECT_NAME' });
  });

  it('refuses bot confirm and person propose', async () => {
    const { rawToken } = await mintLane();
    const proposed = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { name: 'Harbor shed', status: 'proposed' },
    });
    const id = proposed.json<Project>().id;

    const botConfirm = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/confirm`,
      headers: { authorization: `Bearer ${rawToken}` },
      payload: {},
    });
    expect(botConfirm.statusCode).toBe(403);
    expect(botConfirm.json()).toMatchObject({ code: 'PROJECT_CONFIRM_REQUIRES_PERSON' });

    const personPropose = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      payload: { name: 'Person proposal', status: 'proposed' },
    });
    expect(personPropose.statusCode).toBe(403);
    expect(personPropose.json()).toMatchObject({ code: 'PROJECT_PROPOSE_REQUIRES_BOT' });
  });

  it('returns 404 for another org', async () => {
    const { rawToken } = await mintLane();
    const proposed = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { name: 'Harbor shed', status: 'proposed' },
    });
    const id = proposed.json<Project>().id;

    const confirm = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/confirm`,
      cookies: session.cookies,
      payload: {},
    });
    expect(confirm.statusCode).toBe(200);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/projects/550e8400-e29b-41d4-a716-446655440099/confirm',
      cookies: session.cookies,
      payload: {},
    });
    expect(missing.statusCode).toBe(404);
  });
});
