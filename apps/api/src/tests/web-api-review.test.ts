import Fastify from 'fastify';
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../kernel/auth-context.js';
import { invalidCursorError } from '../kernel/listing/domain/invalid-cursor.js';
import { invalidWeekError } from '../modules/review/domain/review-errors.js';
import type {
  RankedReviewProject,
  ReviewDonePage,
  ReviewHandlers,
} from '../modules/review/index.js';
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
const projectId = '550e8400-e29b-41d4-a716-446655440013';
const laterId = '550e8400-e29b-41d4-a716-446655440014';

const authContext: AuthContext = {
  organizationId: orgId,
  userId,
  principalKind: 'human',
  actor: { kind: 'user', userId, via: 'session' },
};

const ranked = (id: string, name: string): RankedReviewProject => ({
  project: {
    id,
    organizationId: orgId,
    createdById: userId,
    name,
    status: 'active',
    waitingOn: null,
    waitingSince: null,
    nextActionTaskId: null,
    notebookPages: [],
    createdAt: '2026-10-04T05:00:00.000Z',
    lastChangedAt: '2026-10-04T05:00:00.000Z',
    lastChangedBy: userId,
  },
  reasons: ['noNextAction'],
  lastChangeAt: '2026-10-04T05:00:00.000Z',
  daysSinceChange: 8,
  daysWaiting: null,
  nextAction: null,
  sectionRank: '0',
  groupOldestSince: '0',
  groupName: '',
  rowWaitingSince: '0',
});

const donePage: ReviewDonePage = {
  timeZone: 'America/Chicago',
  week: { start: '2026-10-05', end: '2026-10-11' },
  previousWeek: '2026-09-28',
  nextWeek: null,
  groups: [],
  otherTaskCount: 0,
  hasMore: false,
  nextCursor: null,
  total: 0,
};

const openApp = async () => {
  const reviewHandlers = stub<ReviewHandlers>();
  reviewHandlers.list = (query) => {
    if (query.cursor !== undefined) {
      return errAsync(invalidCursorError());
    }
    return okAsync({
      items: [ranked(projectId, 'Zebra'), ranked(laterId, 'Alpha')],
      hasMore: false,
      nextCursor: null,
      total: 2,
      today: '2026-10-12',
      counts: { noNextAction: 2, quiet: 0, waiting: 0 },
    });
  };
  reviewHandlers.done = (query) => {
    if (query.week === '2026-10-06') {
      return errAsync(invalidWeekError('week must be a Monday'));
    }
    return okAsync(donePage);
  };
  const app = Fastify();
  const auth = async (request: { authContext?: AuthContext }) => {
    request.authContext = authContext;
  };
  const deps = stub<PublicApiV1Dependencies>();
  deps.reviewHandlers = reviewHandlers;
  deps.tokenAuth = auth;
  deps.aliasAuth = auth;
  deps.aliasRetirement = undefined;
  deps.tokenHandlers = undefined;
  await registerPublicApiV1(app, deps);
  await registerWebApi(app, {
    captures: stub(),
    combinedAuth: auth,
    review: { reviewHandlers },
  });
  return app;
};

describe('web API review', () => {
  it('serves the review list on /web-api in query order and keeps /api and /api/v1', async () => {
    const app = await openApp();
    const web = await app.inject({ method: 'GET', url: '/web-api/review' });
    expect(web.statusCode).toBe(200);
    expect(web.headers.deprecation).toBeUndefined();
    expect(web.json()).toMatchObject({
      today: '2026-10-12',
      projects: [{ project: { name: 'Zebra' } }, { project: { name: 'Alpha' } }],
    });

    const alias = await app.inject({ method: 'GET', url: '/api/review' });
    expect(alias.statusCode).toBe(200);
    expect(alias.json()).toEqual(web.json());

    const v1 = await app.inject({ method: 'GET', url: '/api/v1/review' });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toEqual(web.json());

    const badCursor = await app.inject({
      method: 'GET',
      url: '/web-api/review?cursor=nope',
    });
    const aliasCursor = await app.inject({
      method: 'GET',
      url: '/api/review?cursor=nope',
    });
    expect(badCursor.statusCode).toBe(aliasCursor.statusCode);
    expect(badCursor.json()).toEqual(aliasCursor.json());
  });

  it('serves the done list on /web-api and keeps the Tuesday week body', async () => {
    const app = await openApp();
    const web = await app.inject({ method: 'GET', url: '/web-api/review/done' });
    expect(web.statusCode).toBe(200);
    expect(web.json()).toMatchObject({
      timeZone: 'America/Chicago',
      week: { start: '2026-10-05', end: '2026-10-11' },
    });

    const alias = await app.inject({ method: 'GET', url: '/api/review/done' });
    expect(alias.statusCode).toBe(200);
    expect(alias.json()).toEqual(web.json());

    const v1 = await app.inject({ method: 'GET', url: '/api/v1/review/done' });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toEqual(web.json());

    const tuesday = await app.inject({
      method: 'GET',
      url: '/web-api/review/done?week=2026-10-06',
    });
    const aliasTuesday = await app.inject({
      method: 'GET',
      url: '/api/review/done?week=2026-10-06',
    });
    expect(tuesday.statusCode).toBe(400);
    expect(tuesday.json()).toEqual({ message: 'week must be a Monday', code: 'INVALID_WEEK' });
    expect(aliasTuesday.json()).toEqual(tuesday.json());
  });
});
