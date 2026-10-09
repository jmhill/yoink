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
  it('logs command, actor (null), org, and event kinds on success — never payload values', async () => {
    const { lines, logger } = collectLogger();

    const result = await withCommandLog(
      logger,
      {
        command: 'CreateNamedList',
        organizationId: 'org-1',
        actor: null,
      },
      (value) => value.events.map((event) => event.type),
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
        actorUserId: null,
        actorKind: null,
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
        actor: null,
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
        actorUserId: null,
        actorKind: null,
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
        actor: { kind: 'bot', userId: 'user-bot' },
      },
      () => ['TaskCreated'],
      () => okAsync({ events: [{ type: 'TaskCreated' }] })
    );

    expect(lines[0]?.actorUserId).toBe('user-bot');
    expect(lines[0]?.actorKind).toBe('bot');
  });
});
