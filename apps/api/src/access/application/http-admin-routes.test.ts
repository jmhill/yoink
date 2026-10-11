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
const PATCH_URL = `/api/admin/users/${TEST_USER_ID}`;

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
      url: input.url ?? PATCH_URL,
      payload: input.payload ?? { name: 'Alice' },
      headers: input.headers,
      cookies: input.cookies,
    });

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
