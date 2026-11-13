import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { bootstrapApp, createInfrastructure } from '../composition-root.js';
import { runMigrations } from '../platform/database/migrator.js';
import { migrations } from '../platform/database/migrations.js';
import type { Database } from '../platform/database/types.js';
import { ADMIN_SESSION_COOKIE } from '../edges/_shared/auth/admin-session-middleware.js';
import {
  seedTestUserSession,
  TEST_ADMIN_PASSWORD,
  TEST_ORG_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
  TEST_TOKEN,
  TEST_USER_ID,
  testConfigFull,
} from './helpers/test-app.js';

const SESSION_REFUSED =
  'API tokens cannot create, reissue, or revoke tokens; sign in to the web app.';
const SIBLING_LAST_USED_AT = '2026-10-09T15:04:05.000Z';

const sessionCookie = { cookie: `${TEST_SESSION_COOKIE}=${TEST_SESSION_ID}` };
const seedBearer = { authorization: `Bearer ${TEST_TOKEN}` };

type StoredToken = {
  id: string;
  userId: string;
  organizationId: string;
  tokenHash: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

type ListedToken = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
};

const textOf = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return String(value);
};

const loadTokens = async (database: Database): Promise<StoredToken[]> => {
  const result = await database.execute({
    sql: `SELECT id, user_id, organization_id, token_hash, name, last_used_at, created_at, revoked_at
          FROM api_tokens`,
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    organizationId: String(row.organization_id),
    tokenHash: String(row.token_hash),
    name: String(row.name),
    lastUsedAt: textOf(row.last_used_at),
    createdAt: String(row.created_at),
    revokedAt: textOf(row.revoked_at),
  }));
};

const metadataFor = (tokens: readonly StoredToken[], userId: string, organizationId: string): ListedToken[] =>
  tokens
    .filter(
      (token) =>
        token.userId === userId && token.organizationId === organizationId && token.revokedAt === null
    )
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : left.createdAt > right.createdAt ? -1 : 0))
    .map((token) => {
      const listed: ListedToken = {
        id: token.id,
        name: token.name,
        createdAt: token.createdAt,
      };
      if (token.lastUsedAt !== null) listed.lastUsedAt = token.lastUsedAt;
      return listed;
    });

const allowedKeys = (token: ListedToken): string[] =>
  token.lastUsedAt === undefined
    ? ['createdAt', 'id', 'name']
    : ['createdAt', 'id', 'lastUsedAt', 'name'];

describe('public token list policy', () => {
  let app: FastifyInstance;
  let database: Database;
  let siblingId = '';
  let siblingRaw = '';
  let doomedId = '';
  let doomedRaw = '';
  let coworkerId = '';
  let coworkerRaw = '';
  let outsiderId = '';
  let outsiderRaw = '';

  beforeAll(async () => {
    const infrastructure = createInfrastructure(testConfigFull);
    database = infrastructure.database;
    await runMigrations(database, migrations);
    app = await bootstrapApp({
      config: testConfigFull,
      infrastructure,
      silent: true,
    });
    await seedTestUserSession(database);

    const doomed = await app.inject({
      method: 'POST',
      url: '/api/auth/tokens',
      headers: sessionCookie,
      payload: { name: 'Doomed' },
    });
    expect(doomed.statusCode).toBe(201);
    expect(doomed.headers.link).toBeUndefined();
    const doomedBody = doomed.json<{ token: { id: string }; rawToken: string }>();
    doomedId = doomedBody.token.id;
    doomedRaw = doomedBody.rawToken;

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/auth/tokens/${doomedId}`,
      headers: sessionCookie,
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toEqual({ success: true });

    const sibling = await app.inject({
      method: 'POST',
      url: '/api/auth/tokens',
      headers: sessionCookie,
      payload: { name: 'Sibling' },
    });
    expect(sibling.statusCode).toBe(201);
    const siblingBody = sibling.json<{ token: { id: string }; rawToken: string }>();
    siblingId = siblingBody.token.id;
    siblingRaw = siblingBody.rawToken;
    await database.execute({
      sql: `UPDATE api_tokens SET last_used_at = ? WHERE id = ?`,
      args: [SIBLING_LAST_USED_AT, siblingId],
    });

    const login = await app.inject({
      method: 'POST',
      url: '/admin-api/login',
      payload: { password: TEST_ADMIN_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const adminCookie = login.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE);
    expect(adminCookie?.value).toBeTruthy();
    const admin = { [ADMIN_SESSION_COOKIE]: adminCookie?.value ?? '' };

    const coworker = await app.inject({
      method: 'POST',
      url: `/admin-api/organizations/${TEST_ORG_ID}/users`,
      cookies: admin,
      payload: { email: 'coworker-token-list@example.com', role: 'member' },
    });
    expect(coworker.statusCode).toBe(201);
    const coworkerUserId = coworker.json<{ id: string }>().id;
    const coworkerToken = await app.inject({
      method: 'POST',
      url: `/admin-api/organizations/${TEST_ORG_ID}/tokens`,
      cookies: admin,
      payload: { userId: coworkerUserId, name: 'Coworker' },
    });
    expect(coworkerToken.statusCode).toBe(201);
    const coworkerBody = coworkerToken.json<{ token: { id: string }; rawToken: string }>();
    coworkerId = coworkerBody.token.id;
    coworkerRaw = coworkerBody.rawToken;

    const otherOrg = await app.inject({
      method: 'POST',
      url: '/admin-api/organizations',
      cookies: admin,
      payload: { name: 'Other token org', ownerEmail: 'pending-token-list@example.com' },
    });
    expect(otherOrg.statusCode).toBe(201);
    const otherOrgId = otherOrg.json<{ organization: { id: string } }>().organization.id;
    const outsider = await app.inject({
      method: 'POST',
      url: `/admin-api/organizations/${otherOrgId}/users`,
      cookies: admin,
      payload: { email: 'outsider-token-list@example.com', role: 'member' },
    });
    expect(outsider.statusCode).toBe(201);
    const outsiderUserId = outsider.json<{ id: string }>().id;
    const outsiderToken = await app.inject({
      method: 'POST',
      url: `/admin-api/organizations/${otherOrgId}/tokens`,
      cookies: admin,
      payload: { userId: outsiderUserId, name: 'Outsider' },
    });
    expect(outsiderToken.statusCode).toBe(201);
    const outsiderBody = outsiderToken.json<{ token: { id: string }; rawToken: string }>();
    outsiderId = outsiderBody.token.id;
    outsiderRaw = outsiderBody.rawToken;
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const secretsIn = async (body: unknown) => {
    const serialized = JSON.stringify(body);
    const stored = await loadTokens(database);
    const hidden = [
      ...stored.map((token) => token.tokenHash),
      siblingRaw,
      doomedRaw,
      coworkerRaw,
      outsiderRaw,
      TEST_TOKEN,
      TEST_TOKEN.split(':')[1] ?? '',
      siblingRaw.split(':')[1] ?? '',
      doomedRaw.split(':')[1] ?? '',
      coworkerRaw.split(':')[1] ?? '',
      outsiderRaw.split(':')[1] ?? '',
      'fake-hash:',
    ];
    for (const secret of hidden) {
      expect(secret.length).toBeGreaterThan(0);
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain(doomedId);
    expect(serialized).not.toContain(coworkerId);
    expect(serialized).not.toContain(outsiderId);
  };

  const expectOwnList = async (
    url: '/api/v1/auth/tokens' | '/api/auth/tokens',
    headers: Record<string, string>,
    alias: boolean
  ) => {
    const response = await app.inject({ method: 'GET', url, headers });
    expect(response.statusCode).toBe(200);
    if (alias) {
      expect(response.headers.link).toBe('</api/v1/auth/tokens>; rel="successor-version"');
    } else {
      expect(response.headers.link).toBeUndefined();
    }
    expect(response.headers.deprecation).toBeUndefined();
    expect(response.headers.sunset).toBeUndefined();

    const stored = await loadTokens(database);
    const expected = metadataFor(stored, TEST_USER_ID, TEST_ORG_ID);
    const body = response.json<{ tokens: ListedToken[] }>();
    expect(Object.keys(body)).toEqual(['tokens']);
    expect(body.tokens).toEqual(expected);
    expect(body.tokens.map((token) => token.id)).toEqual(expect.arrayContaining([siblingId]));
    expect(body.tokens.map((token) => token.name)).toEqual(expect.arrayContaining(['Sibling', 'seed-token']));
    for (const token of body.tokens) {
      expect(Object.keys(token).sort()).toEqual(allowedKeys(token));
    }
    const sibling = body.tokens.find((token) => token.id === siblingId);
    expect(sibling).toEqual({
      id: siblingId,
      name: 'Sibling',
      createdAt: sibling?.createdAt,
      lastUsedAt: SIBLING_LAST_USED_AT,
    });
    await secretsIn(body);
    return body;
  };

  it('lists the caller and a sibling on v1 and the alias, and keeps writes session-only', async () => {
    const sessionOnV1 = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: sessionCookie,
    });
    expect(sessionOnV1.statusCode).toBe(401);
    expect(sessionOnV1.json()).toEqual({ message: 'Missing authorization header' });
    expect(sessionOnV1.headers.link).toBeUndefined();

    const sessionAlias = await expectOwnList('/api/auth/tokens', sessionCookie, true);
    const seedBeforeBearer = sessionAlias.tokens.find((token) => token.name === 'seed-token');
    expect(seedBeforeBearer?.lastUsedAt).toBeUndefined();

    await expectOwnList('/api/v1/auth/tokens', seedBearer, false);
    const bearerAlias = await expectOwnList('/api/auth/tokens', seedBearer, true);
    const seedAfterBearer = bearerAlias.tokens.find((token) => token.name === 'seed-token');
    expect(seedAfterBearer?.id).toBe(TEST_TOKEN.split(':')[0]);

    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/tokens',
      headers: sessionCookie,
      payload: { name: 'Third' },
    });
    expect(limited.statusCode).toBe(409);
    expect(limited.json().message).toContain('at most 2');

    const bearerCreate = await app.inject({
      method: 'POST',
      url: '/api/auth/tokens',
      headers: seedBearer,
      payload: { name: 'Nope' },
    });
    expect(bearerCreate.statusCode).toBe(403);
    expect(bearerCreate.json().message).toBe(SESSION_REFUSED);

    const bearerRevoke = await app.inject({
      method: 'DELETE',
      url: `/api/auth/tokens/${siblingId}`,
      headers: seedBearer,
    });
    expect(bearerRevoke.statusCode).toBe(403);
    expect(bearerRevoke.json().message).toBe(SESSION_REFUSED);

    for (const headers of [sessionCookie, seedBearer]) {
      const versionedCreate = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/tokens',
        headers,
        payload: { name: 'Nope' },
      });
      expect(versionedCreate.statusCode).toBe(404);
      const versionedRevoke = await app.inject({
        method: 'DELETE',
        url: `/api/v1/auth/tokens/${siblingId}`,
        headers,
      });
      expect(versionedRevoke.statusCode).toBe(404);
    }

    const stillThere = await expectOwnList('/api/v1/auth/tokens', seedBearer, false);
    expect(stillThere.tokens.map((token) => token.id)).toContain(siblingId);

    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      headers: sessionCookie,
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    const agent = minted.json<{ agent: { userId: string }; rawToken: string }>();
    const reissueUrl = `/api/organizations/${TEST_ORG_ID}/members/${agent.agent.userId}/token`;

    const bearerReissue = await app.inject({
      method: 'POST',
      url: reissueUrl,
      headers: seedBearer,
      payload: {},
    });
    expect(bearerReissue.statusCode).toBe(403);
    expect(bearerReissue.json().message).toBe(SESSION_REFUSED);

    for (const headers of [sessionCookie, seedBearer]) {
      const versionedReissue = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${TEST_ORG_ID}/members/${agent.agent.userId}/token`,
        headers,
        payload: {},
      });
      expect(versionedReissue.statusCode).toBe(404);
    }

    const oldAgentStillWorks = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: { authorization: `Bearer ${agent.rawToken}` },
    });
    expect(oldAgentStillWorks.statusCode).toBe(200);

    const reissued = await app.inject({
      method: 'POST',
      url: reissueUrl,
      headers: sessionCookie,
      payload: {},
    });
    expect(reissued.statusCode).toBe(201);
    expect(reissued.headers.link).toBeUndefined();
    const issued = reissued.json<{ rawToken: string; token: { id: string; name: string; createdAt: string } }>();
    expect(issued.rawToken).toMatch(/^[^:]+:[^:]+$/);

    const oldAgent = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: { authorization: `Bearer ${agent.rawToken}` },
    });
    expect(oldAgent.statusCode).toBe(401);

    const agentList = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: { authorization: `Bearer ${issued.rawToken}` },
    });
    expect(agentList.statusCode).toBe(200);
    const stored = await loadTokens(database);
    const agentMetadata = metadataFor(stored, agent.agent.userId, TEST_ORG_ID);
    expect(agentList.json()).toEqual({ tokens: agentMetadata });
    expect(agentMetadata.map((token) => token.id)).toEqual([issued.token.id]);
    expect(agentMetadata.map((token) => token.id)).not.toContain(siblingId);
    const agentSerialized = JSON.stringify(agentList.json());
    expect(agentSerialized).not.toContain(issued.rawToken.split(':')[1] ?? '');
    expect(agentSerialized).not.toContain(agent.rawToken);

    const humanAfter = await expectOwnList('/api/auth/tokens', sessionCookie, true);
    expect(humanAfter.tokens.map((token) => token.id)).not.toContain(issued.token.id);
    expect(humanAfter.tokens.map((token) => token.id)).not.toContain(agent.agent.userId);
  });
});
