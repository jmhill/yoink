import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { withCommandLog, type CommandLogFields } from './command-log.js';

const collectLogger = () => {
  const lines: CommandLogFields[] = [];
  return {
    lines,
    logger: {
      info: (fields: CommandLogFields) => {
        lines.push(fields);
      },
    },
  };
};

describe('withCommandLog', () => {
  it('logs command, actor, org, and event kinds on success — never payload values', async () => {
    const { lines, logger } = collectLogger();

    const result = await withCommandLog(
      logger,
      {
        command: 'CreateNamedList',
        organizationId: 'org-1',
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' },
      },
      (value) => value.events.map((event) => event.type as 'NamedListCreated'),
      () =>
        okAsync({
          events: [{ type: 'NamedListCreated', name: 'SECRET TITLE' }],
          view: { name: 'SECRET TITLE' },
        })
    );

    expect(result.isOk()).toBe(true);
    expect(lines).toEqual([
      {
        command: 'CreateNamedList',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        actorKind: 'user',
        eventKinds: ['NamedListCreated'],
      },
    ]);
    expect(JSON.stringify(lines[0])).not.toContain('SECRET TITLE');
  });

  it('logs the domain error type on failure', async () => {
    const { lines, logger } = collectLogger();

    const result = await withCommandLog(
      logger,
      {
        command: 'CreateNamedList',
        organizationId: 'org-1',
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' },
      },
      () => [],
      () =>
        errAsync({
          type: 'DUPLICATE_LIST_NAME' as const,
          name: 'Groceries',
          message: 'A list with this name already exists',
        })
    );

    expect(result.isErr()).toBe(true);
    expect(lines).toEqual([
      {
        command: 'CreateNamedList',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        actorKind: 'user',
        errorType: 'DUPLICATE_LIST_NAME',
      },
    ]);
    expect(JSON.stringify(lines[0])).not.toContain('Groceries');
  });

  it('includes actor user id and kind when an actor is present', async () => {
    const { lines, logger } = collectLogger();

    await withCommandLog(
      logger,
      {
        command: 'CreateTask',
        organizationId: 'org-1',
        actor: { kind: 'bot', userId: 'user-bot', tokenId: 'tok-1', name: 'Lane', via: 'token' },
      },
      () => ['TaskCreated'] as const,
      () => okAsync({ events: [{ type: 'TaskCreated' }] })
    );

    expect(lines[0]?.actorUserId).toBe('user-bot');
    expect(lines[0]?.actorKind).toBe('bot');
  });
});
