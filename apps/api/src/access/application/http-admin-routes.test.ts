import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestAppFull,
  TEST_ADMIN_PASSWORD,
  TEST_ORG_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
  TEST_TOKEN,
  TEST_USER_ID,
} from '../../tests/helpers/test-app.js';
import { ADMIN_SESSION_COOKIE } from './admin-session-middleware.js';

const UNKNOWN_USER_ID = '550e8400-e29b-41d4-a716-446655440099';
const UNKNOWN_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440098';
const PATCH_USER_URL = `/api/admin/users/${TEST_USER_ID}`;
const PATCH_PROJECT_URL = `/api/admin/projects/${UNKNOWN_PROJECT_ID}`;
const BACKDATED_CREATED_AT = '2026-10-09T12:00:00.000Z';

describe('admin HTTP routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestAppFull();
  });

  const loginAdmin = async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: TEST_ADMIN_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE);
    expect(cookie?.value).toBeTruthy();
    return { [ADMIN_SESSION_COOKIE]: cookie!.value };
  };

  const mintAgentToken = async () => {
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    return minted.json<{ rawToken: string }>().rawToken;
  };

  const patchName = (input: {
    url?: string;
    payload?: { name: string };
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  }) =>
    app.inject({
      method: 'PATCH',
      url: input.url ?? PATCH_USER_URL,
      payload: input.payload ?? { name: 'Alice' },
      headers: input.headers,
      cookies: input.cookies,
    });

  const patchCreatedAt = (input: {
    url?: string;
    payload?: { createdAt: string };
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  }) =>
    app.inject({
      method: 'PATCH',
      url: input.url ?? PATCH_PROJECT_URL,
      payload: input.payload ?? { createdAt: BACKDATED_CREATED_AT },
      headers: input.headers,
      cookies: input.cookies,
    });

  describe('PATCH /api/admin/users/:id', () => {
    it('returns 401 without an admin login', async () => {
      const response = await patchName({});
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 or 403 for a person API token', async () => {
      const response = await patchName({
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      expect([401, 403]).toContain(response.statusCode);
    });

    it('returns 401 or 403 for an agent API token', async () => {
      const rawToken = await mintAgentToken();
      const response = await patchName({
        headers: { authorization: `Bearer ${rawToken}` },
      });
      expect([401, 403]).toContain(response.statusCode);
    });

    it('returns 401 or 403 for a normal web session', async () => {
      const response = await patchName({
        cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      });
      expect([401, 403]).toContain(response.statusCode);
    });

    it('returns 404 for an unknown id', async () => {
      const cookies = await loginAdmin();
      const response = await patchName({
        url: `/api/admin/users/${UNKNOWN_USER_ID}`,
        cookies,
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for an empty or whitespace name', async () => {
      const cookies = await loginAdmin();
      const empty = await patchName({ cookies, payload: { name: '' } });
      expect(empty.statusCode).toBe(400);
      const whitespace = await patchName({ cookies, payload: { name: '   ' } });
      expect(whitespace.statusCode).toBe(400);
    });

    it('returns 200 and sets the name for an instance admin login', async () => {
      const cookies = await loginAdmin();
      const created = await app.inject({
        method: 'POST',
        url: `/api/admin/organizations/${TEST_ORG_ID}/users`,
        cookies,
        payload: { email: 'alice@example.com', role: 'member' },
      });
      expect(created.statusCode).toBe(201);
      const user = created.json<{ id: string }>();

      const response = await patchName({
        url: `/api/admin/users/${user.id}`,
        cookies,
        payload: { name: 'Alice' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: user.id,
        email: 'alice@example.com',
        name: 'Alice',
      });
    });
  });

  describe('PATCH /api/admin/projects/:id', () => {
    it('returns 401 without an admin login', async () => {
      const response = await patchCreatedAt({});
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 or 403 for a person API token', async () => {
      const response = await patchCreatedAt({
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      expect([401, 403]).toContain(response.statusCode);
    });

    it('returns 401 or 403 for an agent API token', async () => {
      const rawToken = await mintAgentToken();
      const response = await patchCreatedAt({
        headers: { authorization: `Bearer ${rawToken}` },
      });
      expect([401, 403]).toContain(response.statusCode);
    });

    it('returns 401 or 403 for a normal web session', async () => {
      const response = await patchCreatedAt({
        cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      });
      expect([401, 403]).toContain(response.statusCode);
    });

    it('returns 404 for an unknown id', async () => {
      const cookies = await loginAdmin();
      const response = await patchCreatedAt({ cookies });
      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for a createdAt that is not an ISO date-time', async () => {
      const cookies = await loginAdmin();
      const response = await patchCreatedAt({
        cookies,
        payload: { createdAt: 'not-a-date' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 200 and a later read shows the new createdAt', async () => {
      const cookies = await loginAdmin();
      const created = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
        payload: { name: 'Old garden' },
      });
      expect(created.statusCode).toBe(201);
      const project = created.json<{ id: string; createdAt: string }>();
      expect(project.createdAt).not.toBe(BACKDATED_CREATED_AT);

      const patched = await patchCreatedAt({
        url: `/api/admin/projects/${project.id}`,
        cookies,
        payload: { createdAt: BACKDATED_CREATED_AT },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({
        id: project.id,
        createdAt: BACKDATED_CREATED_AT,
      });

      const read = await app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      });
      expect(read.statusCode).toBe(200);
      expect(read.json()).toMatchObject({
        id: project.id,
        createdAt: BACKDATED_CREATED_AT,
      });
    });
  });

  describe('workspace owner and member roles', () => {
    it('sets the first owner on a zero-owner workspace, then that person can mint a bot', async () => {
      const cookies = await loginAdmin();
      const org = await app.inject({
        method: 'POST',
        url: '/api/admin/organizations',
        cookies,
        payload: { name: 'Polly UX' },
      });
      expect(org.statusCode).toBe(201);
      const { id: orgId } = org.json<{ id: string }>();

      const invite = await app.inject({
        method: 'POST',
        url: `/api/admin/organizations/${orgId}/invitations`,
        cookies,
        payload: { role: 'member' },
      });
      expect(invite.statusCode).toBe(201);
      const { code } = invite.json<{ code: string }>();

      const accepted = await app.inject({
        method: 'POST',
        url: '/api/invitations/accept',
        cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
        payload: { code },
      });
      expect(accepted.statusCode).toBe(200);

      const setOwner = await app.inject({
        method: 'PUT',
        url: `/api/admin/organizations/${orgId}/owner`,
        cookies,
        payload: { userId: TEST_USER_ID },
      });
      expect(setOwner.statusCode).toBe(200);
      expect(setOwner.json()).toMatchObject({ id: TEST_USER_ID, role: 'owner' });

      const switched = await app.inject({
        method: 'POST',
        url: '/api/organizations/switch',
        cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
        payload: { organizationId: orgId },
      });
      expect(switched.statusCode).toBe(200);

      const minted = await app.inject({
        method: 'POST',
        url: `/api/organizations/${orgId}/agents`,
        cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
        payload: { name: 'Polly bot' },
      });
      expect(minted.statusCode).toBe(201);
    });

    it('demotes the old owner to admin when setting a new owner', async () => {
      const cookies = await loginAdmin();
      const org = await app.inject({
        method: 'POST',
        url: '/api/admin/organizations',
        cookies,
        payload: { name: 'Handover' },
      });
      const { id: orgId } = org.json<{ id: string }>();

      const first = await app.inject({
        method: 'POST',
        url: `/api/admin/organizations/${orgId}/users`,
        cookies,
        payload: { email: 'first-owner@example.com', role: 'member' },
      });
      const second = await app.inject({
        method: 'POST',
        url: `/api/admin/organizations/${orgId}/users`,
        cookies,
        payload: { email: 'next-owner@example.com', role: 'member' },
      });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      const firstId = first.json<{ id: string }>().id;
      const secondId = second.json<{ id: string }>().id;

      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/api/admin/organizations/${orgId}/owner`,
            cookies,
            payload: { userId: firstId },
          })
        ).statusCode
      ).toBe(200);

      const transferred = await app.inject({
        method: 'PUT',
        url: `/api/admin/organizations/${orgId}/owner`,
        cookies,
        payload: { userId: secondId },
      });
      expect(transferred.statusCode).toBe(200);
      expect(transferred.json()).toMatchObject({ id: secondId, role: 'owner' });

      const listed = await app.inject({
        method: 'GET',
        url: `/api/admin/organizations/${orgId}/users`,
        cookies,
      });
      const users = listed.json<{ users: Array<{ id: string; role?: string }> }>().users;
      expect(users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: firstId, role: 'admin' }),
          expect.objectContaining({ id: secondId, role: 'owner' }),
        ])
      );
    });

    it('refuses demoting the owner and creating a bot admin', async () => {
      const cookies = await loginAdmin();
      const org = await app.inject({
        method: 'POST',
        url: '/api/admin/organizations',
        cookies,
        payload: { name: 'Guards' },
      });
      const { id: orgId } = org.json<{ id: string }>();
      const created = await app.inject({
        method: 'POST',
        url: `/api/admin/organizations/${orgId}/users`,
        cookies,
        payload: { email: 'keep-owner@example.com', role: 'member' },
      });
      const userId = created.json<{ id: string }>().id;
      await app.inject({
        method: 'PUT',
        url: `/api/admin/organizations/${orgId}/owner`,
        cookies,
        payload: { userId },
      });

      const demote = await app.inject({
        method: 'PATCH',
        url: `/api/admin/organizations/${orgId}/members/${userId}`,
        cookies,
        payload: { role: 'member' },
      });
      expect(demote.statusCode).toBe(409);
      expect(demote.json().message).toBe(
        'Transfer ownership first. Ask an admin of the whole app to change the owner.'
      );

      const botAdmin = await app.inject({
        method: 'POST',
        url: `/api/admin/organizations/${orgId}/users`,
        cookies,
        payload: { email: 'bot@example.com', kind: 'agent', role: 'admin', name: 'Nope' },
      });
      expect(botAdmin.statusCode).toBe(400);
      expect(botAdmin.json().message).toMatch(/admin/i);

      const botMember = await app.inject({
        method: 'POST',
        url: `/api/admin/organizations/${orgId}/users`,
        cookies,
        payload: { email: 'lane@example.com', kind: 'agent', name: 'Lane' },
      });
      expect(botMember.statusCode).toBe(201);
      const botId = botMember.json<{ id: string }>().id;
      const promoteBot = await app.inject({
        method: 'PATCH',
        url: `/api/admin/organizations/${orgId}/members/${botId}`,
        cookies,
        payload: { role: 'admin' },
      });
      expect(promoteBot.statusCode).toBe(400);
      expect(promoteBot.json().message).toBe('A bot cannot be an admin');

      const still = await app.inject({
        method: 'GET',
        url: `/api/admin/organizations/${orgId}/users`,
        cookies,
      });
      expect(
        still.json<{ users: Array<{ id: string; role?: string }> }>().users
      ).toEqual(expect.arrayContaining([expect.objectContaining({ id: userId, role: 'owner' })]));
    });

    it('returns 404 when the set-owner target user does not exist', async () => {
      const cookies = await loginAdmin();
      const org = await app.inject({
        method: 'POST',
        url: '/api/admin/organizations',
        cookies,
        payload: { name: 'Missing user' },
      });
      const { id: orgId } = org.json<{ id: string }>();

      const missing = await app.inject({
        method: 'PUT',
        url: `/api/admin/organizations/${orgId}/owner`,
        cookies,
        payload: { userId: UNKNOWN_USER_ID },
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().message).toBe('User not found');
    });

    it('returns 400 when the set-owner target is not a workspace member', async () => {
      const cookies = await loginAdmin();
      const org = await app.inject({
        method: 'POST',
        url: '/api/admin/organizations',
        cookies,
        payload: { name: 'Non-member owner' },
      });
      const { id: orgId } = org.json<{ id: string }>();

      const outsider = await app.inject({
        method: 'PUT',
        url: `/api/admin/organizations/${orgId}/owner`,
        cookies,
        payload: { userId: TEST_USER_ID },
      });
      expect(outsider.statusCode).toBe(400);
      expect(outsider.json().code).toBe('TARGET_NOT_WORKSPACE_MEMBER');
      expect(outsider.json().message).toMatch(/member/i);
    });

    it('switches a member to admin and back when an owner remains', async () => {
      const cookies = await loginAdmin();
      const org = await app.inject({
        method: 'POST',
        url: '/api/admin/organizations',
        cookies,
        payload: { name: 'Switch' },
      });
      const { id: orgId } = org.json<{ id: string }>();
      const owner = await app.inject({
        method: 'POST',
        url: `/api/admin/organizations/${orgId}/users`,
        cookies,
        payload: { email: 'switch-owner@example.com', role: 'member' },
      });
      const created = await app.inject({
        method: 'POST',
        url: `/api/admin/organizations/${orgId}/users`,
        cookies,
        payload: { email: 'switch@example.com', role: 'member' },
      });
      const ownerId = owner.json<{ id: string }>().id;
      const userId = created.json<{ id: string }>().id;
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/api/admin/organizations/${orgId}/owner`,
            cookies,
            payload: { userId: ownerId },
          })
        ).statusCode
      ).toBe(200);

      const toAdmin = await app.inject({
        method: 'PATCH',
        url: `/api/admin/organizations/${orgId}/members/${userId}`,
        cookies,
        payload: { role: 'admin' },
      });
      expect(toAdmin.statusCode).toBe(200);
      expect(toAdmin.json()).toMatchObject({ id: userId, role: 'admin' });

      const toMember = await app.inject({
        method: 'PATCH',
        url: `/api/admin/organizations/${orgId}/members/${userId}`,
        cookies,
        payload: { role: 'member' },
      });
      expect(toMember.statusCode).toBe(200);
      expect(toMember.json()).toMatchObject({ id: userId, role: 'member' });
    });
  });
});
