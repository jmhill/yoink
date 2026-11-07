import { describe, expect, it } from 'vitest';
import { err, errAsync, ok, okAsync } from 'neverthrow';
import type { IntegrationEvent } from '../../kernel/integration-event.js';
import type { ModuleName } from '../../kernel/module-name.js';
import type { FakeParticipant, Policy, Work } from '../../kernel/unit-of-work.js';
import { createInMemoryUnitOfWork } from './in-memory-unit-of-work.js';

const event = (type: string): IntegrationEvent => ({
  id: `${type}-id`,
  type,
  schemaVersion: 1,
  organizationId: 'org',
  occurredAt: '2026-11-07T00:00:00.000Z',
  actor: { kind: 'user', userId: 'user', via: 'session' },
  subject: { type: 'task', id: 'task-1' },
  payload: {},
});

const work = (owner: ModuleName, types: readonly string[] = []): Work<null> => ({
  result: null,
  events: types.map((type) => event(type)),
  step: { owner, plan: owner },
});

type Box = {
  readonly participant: FakeParticipant<unknown>;
  read: () => number;
  restoreCount: () => number;
};

const box = (owner: ModuleName, fail = false): Box => {
  let value = 0;
  let restores = 0;
  const participant: FakeParticipant<unknown> = {
    owner,
    snapshot: () => {
      const saved = value;
      return () => {
        restores += 1;
        value = saved;
      };
    },
    apply: () => {
      value += 1;
      if (fail) {
        return err({ kind: 'Conflict', owner: 'history', reason: 'guard-miss' });
      }
      return ok(undefined);
    },
  };
  return {
    participant,
    read: () => value,
    restoreCount: () => restores,
  };
};

describe('createInMemoryUnitOfWork', () => {
  it('rejects two participants for one module', () => {
    expect(() =>
      createInMemoryUnitOfWork({
        participants: [box('captures').participant, box('captures').participant],
      })
    ).toThrow('Duplicate unit-of-work participant: captures');
  });

  it('keeps applied values and does not restore', async () => {
    const captures = box('captures');
    const tasks = box('task-management');
    const uow = createInMemoryUnitOfWork({
      participants: [captures.participant, tasks.participant],
    });

    const result = await uow.commit([work('captures'), work('task-management')]);

    expect(result.isOk()).toBe(true);
    expect(captures.read()).toBe(1);
    expect(tasks.read()).toBe(1);
    expect(captures.restoreCount()).toBe(0);
    expect(tasks.restoreCount()).toBe(0);
  });

  it('restores every fake when one apply fails, and keeps the step owner', async () => {
    const captures = box('captures');
    const tasks = box('task-management', true);
    const idle = box('notes');
    const uow = createInMemoryUnitOfWork({
      participants: [captures.participant, tasks.participant, idle.participant],
    });

    const result = await uow.commit([work('captures'), work('task-management')]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Conflict',
        owner: 'task-management',
        reason: 'guard-miss',
      });
    }
    expect(captures.read()).toBe(0);
    expect(tasks.read()).toBe(0);
    expect(idle.read()).toBe(0);
    expect(captures.restoreCount()).toBe(1);
    expect(tasks.restoreCount()).toBe(1);
    expect(idle.restoreCount()).toBe(1);
  });

  it('restores every fake when a policy refuses, before apply', async () => {
    const captures = box('captures');
    let seen = -1;
    const policies: readonly Policy[] = [
      {
        on: 'TaskDeleted',
        react: () => {
          seen = captures.read();
          return okAsync({
            result: null,
            events: [event('CaptureDeleted')],
            step: { owner: 'captures', plan: 'captures' },
          } satisfies Work<null>);
        },
      },
      {
        on: 'CaptureDeleted',
        react: () => {
          throw new Error('policy work must not be applied again');
        },
      },
    ];
    const uow = createInMemoryUnitOfWork({
      participants: [captures.participant, box('task-management').participant],
      policies,
    });

    const committed = await uow.commit([work('task-management', ['TaskDeleted'])]);

    expect(committed.isOk()).toBe(true);
    expect(seen).toBe(0);
    expect(captures.read()).toBe(1);
  });

  it('aborts on policy refusal and restores', async () => {
    const captures = box('captures');
    const uow = createInMemoryUnitOfWork({
      participants: [captures.participant],
      policies: [
        {
          on: 'TaskDeleted',
          react: () => errAsync({ kind: 'Refused', reason: 'no' }),
        },
      ],
    });

    const result = await uow.commit([work('captures', ['TaskDeleted'])]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ kind: 'Refused', reason: 'no' });
    }
    expect(captures.read()).toBe(0);
    expect(captures.restoreCount()).toBe(1);
  });
});
