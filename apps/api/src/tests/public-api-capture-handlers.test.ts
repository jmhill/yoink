import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errAsync, okAsync } from 'neverthrow';
import type { AuthMiddleware } from '../edges/_shared/auth/auth-middleware.js';
import { invalidCursorError } from '../kernel/listing/domain/invalid-cursor.js';
import type { AuthContext } from '../kernel/auth-context.js';
import type { CaptureHandlers } from '../captures/application/create-capture-handlers.js';
import {
  captureAlreadyTrashedError,
  captureNotInTrashError,
  storageError,
} from '../captures/domain/capture-errors.js';
import type { CaptureProcessingService } from '../processing/application/create-processing-handlers.js';
import { registerPublicApiV1 } from '../edges/public-api/v1/index.js';
import type { PublicApiV1Dependencies } from '../edges/public-api/v1/register.js';

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

const processing: CaptureProcessingService = {
  processCaptureToTask: unused,
  processCaptureToProject: unused,
};

const stub = <T extends object>(): T =>
  new Proxy({} as T, {
    get: (target, prop, receiver) => {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      return () => {
        throw new Error(`unexpected ${String(prop)}`);
      };
    },
  });

const mount = async (
  app: FastifyInstance,
  options: {
    authMiddleware?: AuthMiddleware;
    captureHandlers?: CaptureHandlers;
    captureProcessingService?: CaptureProcessingService;
  } = {}
) => {
  const auth = options.authMiddleware ?? authAs(humanContext);
  const deps = stub<PublicApiV1Dependencies>();
  deps.captureHandlers = options.captureHandlers ?? handlers({});
  deps.captureProcessingService = options.captureProcessingService ?? processing;
  deps.tokenHandlers = undefined;
  deps.aliasRetirement = undefined;
  deps.tokenAuth = auth;
  deps.aliasAuth = auth;
  await registerPublicApiV1(app, deps);
};

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
    await mount(app, {
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
    await mount(app, {
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
    await mount(app, {
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
    await mount(app, {
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

describe('oRPC capture lifecycle', () => {
  it('gets, updates, trashes, and restores on the capture paths', async () => {
    const { app } = loggedApp();
    await mount(app, {
      captureHandlers: handlers({
        find: () => okAsync(captureView),
        update: () =>
          okAsync({
            event: null,
            view: { ...captureView, content: 'Updated' },
          }),
        trash: () =>
          okAsync({
            event: null,
            view: { ...captureView, status: 'trashed' },
          }),
        restore: () =>
          okAsync({
            event: null,
            view: captureView,
          }),
      }),
    });

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/captures/${captureView.id}`,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({ id: captureView.id, content: 'Hello' });

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/captures/${captureView.id}`,
      payload: { content: 'Updated' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ content: 'Updated' });

    const trashed = await app.inject({
      method: 'POST',
      url: `/api/captures/${captureView.id}/trash`,
      payload: {},
    });
    expect(trashed.statusCode).toBe(200);
    expect(trashed.json()).toMatchObject({ status: 'trashed' });

    const restored = await app.inject({
      method: 'POST',
      url: `/api/captures/${captureView.id}/restore`,
      payload: {},
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ status: 'inbox' });
    await app.close();
  });

  it('rejects a trashed snooze, deletes only from trash, and empties trash', async () => {
    const { app } = loggedApp();
    await mount(app, {
      captureHandlers: handlers({
        snooze: () => errAsync(captureAlreadyTrashedError(captureView.id)),
        delete: () => errAsync(captureNotInTrashError(captureView.id)),
        emptyTrash: () =>
          okAsync({
            event: { type: 'CaptureTrashEmptied', organizationId: captureView.organizationId },
            deletedCount: 2,
          }),
      }),
    });

    const snoozed = await app.inject({
      method: 'POST',
      url: `/api/captures/${captureView.id}/snooze`,
      payload: { until: '2027-12-31T00:00:00.000Z' },
    });
    expect(snoozed.statusCode).toBe(400);
    expect(snoozed.json()).toEqual({ message: 'Cannot snooze a trashed capture' });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/captures/${captureView.id}`,
    });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json()).toEqual({
      message: 'Capture must be in trash before it can be deleted',
    });

    const emptied = await app.inject({
      method: 'POST',
      url: '/api/captures/trash/empty',
      payload: {},
    });
    expect(emptied.statusCode).toBe(200);
    expect(emptied.json()).toEqual({ deletedCount: 2 });
    await app.close();
  });

  it('returns an empty 204 when a trashed capture is deleted', async () => {
    const { app } = loggedApp();
    await mount(app, {
      captureHandlers: handlers({
        delete: () =>
          okAsync({
            type: 'CaptureDeleted',
            id: captureView.id,
            organizationId: captureView.organizationId,
          }),
      }),
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/captures/${captureView.id}`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    await app.close();
  });
});

