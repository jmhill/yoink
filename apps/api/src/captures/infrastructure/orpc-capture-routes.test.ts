import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errAsync, okAsync } from 'neverthrow';
import type { Capture, CaptureListPage } from '@yoink/api-contracts';
import type { AuthMiddleware } from '../../access/application/index.js';
import { invalidCursorError } from '../../listing/domain/invalid-cursor.js';
import type { AuthContext } from '../../shared/auth-context.js';
import {
  createTestApp,
  createTestAppWithWebAuthn,
  TEST_ORG_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
  TEST_TOKEN,
  TEST_USER_ID,
} from '../../tests/helpers/test-app.js';
import type { CaptureHandlers } from '../application/create-capture-handlers.js';
import { storageError } from '../domain/capture-errors.js';
import { registerOrpcCaptureRoutes } from './orpc-capture-routes.js';

const bearer = { authorization: `Bearer ${TEST_TOKEN}` };

const humanContext: AuthContext = {
  organizationId: 'org-1',
  userId: 'user-1',
  principalKind: 'human',
  actor: { kind: 'user', userId: 'user-1', via: 'token' },
};

const agentContext: AuthContext = {
  organizationId: 'org-1',
  userId: 'agent-1',
  principalKind: 'agent',
  actor: {
    kind: 'bot',
    tokenId: 'token-1',
    userId: 'agent-1',
    name: 'Lane',
    via: 'token',
  },
};

const authAs = (context: AuthContext): AuthMiddleware => async (request) => {
  request.authContext = context;
};

const unused = () => errAsync(storageError('unused'));

const handlers = (overrides: Partial<CaptureHandlers>): CaptureHandlers => ({
  create: unused,
  find: unused,
  list: unused,
  update: unused,
  trash: unused,
  restore: unused,
  snooze: unused,
  unsnooze: unused,
  delete: unused,
  emptyTrash: unused,
  ...overrides,
});

const loggedApp = (): { app: FastifyInstance; lines: string[] } => {
  const lines: string[] = [];
  const app = Fastify({
    logger: {
      level: 'info',
      stream: {
        write: (message: string) => {
          lines.push(message);
        },
      },
    },
  });
  return { app, lines };
};

const captureView = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  content: 'Hello',
  status: 'inbox',
  capturedAt: '2026-10-12T01:00:00.000Z',
} as const;

describe('oRPC capture create and list', () => {
  it('logs the original storage error and returns the generic 500 body', async () => {
    const cause = storageError('disk full', new Error('sqlite'));
    const { app, lines } = loggedApp();
    await registerOrpcCaptureRoutes(app, {
      authMiddleware: authAs(humanContext),
      captureHandlers: handlers({
        create: () => errAsync(cause),
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      payload: { content: 'Hello' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: 'Internal server error' });
    expect(response.json()).not.toHaveProperty('defined');
    const log = lines.join('\n');
    expect(log).toContain('Failed to create capture');
    expect(log).toContain('disk full');
    await app.close();
  });

  it('returns invalid_cursor without calling out to a different envelope', async () => {
    const { app } = loggedApp();
    await registerOrpcCaptureRoutes(app, {
      authMiddleware: authAs(humanContext),
      captureHandlers: handlers({
        list: () => errAsync(invalidCursorError()),
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/captures?cursor=nope' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Cursor is invalid',
      code: 'invalid_cursor',
    });
    await app.close();
  });

  it('returns the capture view on 201', async () => {
    const { app } = loggedApp();
    await registerOrpcCaptureRoutes(app, {
      authMiddleware: authAs(humanContext),
      captureHandlers: handlers({
        create: () =>
          okAsync({
            event: {
              type: 'CaptureCreated',
              id: captureView.id,
              organizationId: captureView.organizationId,
              createdById: captureView.createdById,
              content: captureView.content,
              capturedAt: captureView.capturedAt,
            },
            view: captureView,
          }),
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      payload: { content: 'Hello' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: captureView.id,
      content: 'Hello',
      status: 'inbox',
    });
    await app.close();
  });

  it('refuses an agent before the handler runs', async () => {
    let calls = 0;
    const { app } = loggedApp();
    await registerOrpcCaptureRoutes(app, {
      authMiddleware: authAs(agentContext),
      captureHandlers: handlers({
        create: () => {
          calls += 1;
          return errAsync(storageError('should not run'));
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      payload: { content: 'Hello' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: 'Agents cannot create captures' });
    expect(calls).toBe(0);
    await app.close();
  });
});

describe('capture create and list on the composed app', () => {
  it('creates and lists through bearer auth, and still trashes through ts-rest', async () => {
    const app = await createTestApp();

    const missing = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: bearer,
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toEqual({
      message: 'Request validation failed: content',
      code: 'VALIDATION_FAILED',
      fields: ['content'],
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: bearer,
      payload: { content: 'From bearer' },
    });
    expect(created.statusCode).toBe(201);
    const capture = created.json<Capture>();
    expect(capture.organizationId).toBe(TEST_ORG_ID);
    expect(capture.createdById).toBe(TEST_USER_ID);
    expect(capture.content).toBe('From bearer');
    expect(capture.status).toBe('inbox');

    const badStatus = await app.inject({
      method: 'GET',
      url: '/api/captures?status=nope',
      headers: bearer,
    });
    expect(badStatus.statusCode).toBe(400);
    expect(badStatus.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: ['status'],
    });

    const snoozed = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/snooze`,
      headers: bearer,
      payload: { until: '2027-12-31T00:00:00.000Z' },
    });
    expect(snoozed.statusCode).toBe(200);

    const kept = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: bearer,
      payload: { content: 'Stay in inbox' },
    });
    expect(kept.statusCode).toBe(201);

    const inbox = await app.inject({
      method: 'GET',
      url: '/api/captures?status=inbox&snoozed=false',
      headers: bearer,
    });
    expect(inbox.statusCode).toBe(200);
    const page = inbox.json<CaptureListPage>();
    expect(page.captures.map((item) => item.content)).toEqual(['Stay in inbox']);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();

    const onlySnoozed = await app.inject({
      method: 'GET',
      url: '/api/captures?snoozed=true',
      headers: bearer,
    });
    expect(onlySnoozed.statusCode).toBe(200);
    expect(onlySnoozed.json<CaptureListPage>().captures.map((item) => item.id)).toEqual([
      capture.id,
    ]);

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/captures/${capture.id}`,
      headers: bearer,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<Capture>().content).toBe('From bearer');
  });

  it('accepts a session cookie and refuses an agent token', async () => {
    const app = await createTestAppWithWebAuthn();
    const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };

    const created = await app.inject({
      method: 'POST',
      url: '/api/captures',
      cookies: session.cookies,
      payload: { content: 'From session' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<Capture>().createdById).toBe(TEST_USER_ID);

    const unauthenticated = await app.inject({ method: 'GET', url: '/api/captures' });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ message: 'Not authenticated' });

    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken } = minted.json<{ rawToken: string }>();

    const refused = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { content: 'Bot note' },
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ message: 'Agents cannot create captures' });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/captures?status=inbox&snoozed=false',
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<CaptureListPage>().captures.map((item) => item.content)).toContain(
      'From session'
    );
  });
});
