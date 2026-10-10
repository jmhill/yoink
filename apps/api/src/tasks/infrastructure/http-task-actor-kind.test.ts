import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import {
  createTestAppWithWebAuthnAndDatabase,
  TEST_TOKEN,
  TEST_USER_ID,
  TEST_ORG_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
} from '../../tests/helpers/test-app.js';
import { createSqliteChangeLogStore } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';

describe('POST /api/tasks actor kind', () => {
  it('records a person token as user and an agent token as bot', async () => {
    const { app, database } = await createTestAppWithWebAuthnAndDatabase();
    const changeLog = createSqliteChangeLogStore(database);

    const personCreate = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { title: 'From my token' },
    });
    expect(personCreate.statusCode).toBe(201);
    const personTask = personCreate.json<Task>();

    const personLog = (await changeLog.findBySubject('task', personTask.id))._unsafeUnwrap();
    expect(personLog[0]?.actorKind).toBe('user');
    expect(personLog[0]?.actorUserId).toBe(TEST_USER_ID);

    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID },
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken, agent } = minted.json<{
      rawToken: string;
      agent: { userId: string };
    }>();

    const agentCreate = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { title: 'From Lane' },
    });
    expect(agentCreate.statusCode).toBe(201);
    const agentTask = agentCreate.json<Task>();

    const agentLog = (await changeLog.findBySubject('task', agentTask.id))._unsafeUnwrap();
    expect(agentLog[0]?.actorKind).toBe('bot');
    expect(agentLog[0]?.actorUserId).toBe(agent.userId);
  });
});
