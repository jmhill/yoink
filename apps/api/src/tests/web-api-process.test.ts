import Fastify from 'fastify';
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../kernel/auth-context.js';
import { captureNotInInboxError, type Capture, type Captures } from '../modules/captures/index.js';
import type { CaptureProcessingService } from '../workflows/processing/index.js';
import {
  registerPublicApiV1,
  type PublicApiV1Dependencies,
} from '../edges/public-api/v1/index.js';
import { registerWebApi } from '../edges/web/index.js';

const stub = <T extends object>(): T =>
  new Proxy({} as T, {
    get: (target, prop, receiver) => {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      return () => {
        throw new Error(`unexpected ${String(prop)}`);
      };
    },
  });

const orgId = '550e8400-e29b-41d4-a716-446655440001';
const userId = '550e8400-e29b-41d4-a716-446655440002';
const captureId = '550e8400-e29b-41d4-a716-446655440099';

const authContext: AuthContext = {
  organizationId: orgId,
  userId,
  principalKind: 'human',
  actor: { kind: 'user', userId, via: 'session' },
};

const captureView: Capture = {
  id: captureId,
  organizationId: orgId,
  createdById: userId,
  content: 'Buy milk',
  status: 'inbox',
  capturedAt: '2024-06-15T12:00:00.000Z',
};

const trashedView: Capture = {
  ...captureView,
  status: 'trashed',
  trashedAt: '2024-06-15T12:05:00.000Z',
};

const task = {
  id: '550e8400-e29b-41d4-a716-446655440021',
  organizationId: orgId,
  createdById: userId,
  title: 'Buy milk',
  captureId,
  createdAt: '2024-06-15T12:00:00.000Z',
  lastChangedAt: '2024-06-15T12:00:00.000Z',
  lastChangedBy: userId,
  completedBy: null,
};

const openApp = async (processing: CaptureProcessingService) => {
  const commands = stub<Captures['commands']>();
  commands.trashCapture = () => okAsync({ event: null, view: trashedView });
  commands.emptyTrash = () =>
    okAsync({
      event: { type: 'CaptureTrashEmptied', organizationId: orgId },
      deletedCount: 2,
    });
  const captures = stub<Captures>();
  captures.commands = commands;
  const app = Fastify();
  const auth = async (request: { authContext?: AuthContext }) => {
    request.authContext = authContext;
  };
  const deps = stub<PublicApiV1Dependencies>();
  deps.captures = captures;
  deps.captureProcessingService = processing;
  deps.tokenAuth = auth;
  deps.aliasAuth = auth;
  deps.aliasRetirement = undefined;
  deps.tokenHandlers = undefined;
  await registerPublicApiV1(app, deps);
  await registerWebApi(app, {
    captures,
    combinedAuth: auth,
    process: { captures, captureProcessingService: processing },
  });
  return app;
};

describe('web API process', () => {
  it('serves trash on /web-api and keeps /api and /api/v1', async () => {
    const app = await openApp(stub<CaptureProcessingService>());
    const web = await app.inject({
      method: 'POST',
      url: `/web-api/captures/${captureId}/trash`,
      payload: {},
    });
    expect(web.statusCode).toBe(200);
    expect(web.json()).toEqual({
      id: captureId,
      organizationId: orgId,
      createdById: userId,
      content: 'Buy milk',
      status: 'trashed',
      capturedAt: '2024-06-15T12:00:00.000Z',
      trashedAt: '2024-06-15T12:05:00.000Z',
    });
    expect(web.headers.deprecation).toBeUndefined();

    const alias = await app.inject({
      method: 'POST',
      url: `/api/captures/${captureId}/trash`,
      payload: {},
    });
    expect(alias.statusCode).toBe(200);
    expect(alias.json()).toEqual(web.json());

    const v1 = await app.inject({
      method: 'POST',
      url: `/api/v1/captures/${captureId}/trash`,
      payload: {},
    });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toEqual(web.json());

    const emptied = await app.inject({
      method: 'POST',
      url: '/web-api/captures/trash/empty',
      payload: {},
    });
    expect(emptied.statusCode).toBe(200);
    expect(emptied.json()).toEqual({ deletedCount: 2 });
    await app.close();
  });

  it('keeps the second process as HTTP 400 with the frozen body', async () => {
    const processing = stub<CaptureProcessingService>();
    processing.processCaptureToTask = () => errAsync(captureNotInInboxError(captureId));
    const app = await openApp(processing);
    const again = await app.inject({
      method: 'POST',
      url: `/web-api/captures/${captureId}/process`,
      payload: { type: 'task', data: { title: 'Buy milk' } },
    });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toEqual({ message: 'Capture must be in inbox to be processed' });

    processing.processCaptureToTask = () => okAsync(task);
    const processed = await app.inject({
      method: 'POST',
      url: `/web-api/captures/${captureId}/process`,
      payload: { type: 'task', data: { title: 'Buy milk' } },
    });
    expect(processed.statusCode).toBe(201);
    expect(processed.json()).toMatchObject({ title: 'Buy milk', captureId });

    const blank = await app.inject({
      method: 'POST',
      url: `/web-api/captures/${captureId}/process-to-project`,
      payload: { name: '', status: 'active' },
    });
    expect(blank.statusCode).toBe(400);
    expect(blank.json()).toEqual({
      message: "Name can't be blank",
      code: 'PROJECT_NAME_BLANK',
    });
    await app.close();
  });
});
