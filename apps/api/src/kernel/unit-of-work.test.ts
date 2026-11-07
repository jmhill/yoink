import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { IntegrationEvent } from './integration-event.js';
import type { ModuleName } from './module-name.js';
import {
  prepareCommit,
  type Policy,
  type PolicyRefusal,
  type StepFailure,
  type Work,
} from './unit-of-work.js';

type StepFailureKinds = StepFailure['kind'];
type ClosedStepFailure = StepFailureKinds extends 'Conflict' | 'Storage'
  ? 'Conflict' | 'Storage' extends StepFailureKinds
    ? true
    : never
  : never;

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
  step: { owner, plan: { owner } },
});

const owners = (...names: readonly ModuleName[]): ReadonlySet<ModuleName> => new Set(names);

describe('StepFailure', () => {
  it('stays Conflict or Storage', () => {
    const closed: ClosedStepFailure = true;
    expect(closed).toBe(true);
  });
});

describe('prepareCommit', () => {
  it('appends policy work and does not run policies on that work', async () => {
    const seen: string[] = [];
    const policies: readonly Policy[] = [
      {
        on: 'TaskDeleted',
        react: () => {
          seen.push('delete-capture');
          return okAsync(work('captures', ['CaptureDeleted']));
        },
      },
      {
        on: 'CaptureDeleted',
        react: () => {
          seen.push('again');
          return okAsync(work('notes'));
        },
      },
    ];

    const prepared = await prepareCommit({
      works: [work('task-management', ['TaskDeleted'])],
      policies,
      owners: owners('task-management', 'captures', 'notes'),
    });

    expect(seen).toEqual(['delete-capture']);
    expect(prepared.isOk()).toBe(true);
    if (prepared.isOk()) {
      expect(prepared.value.steps.map((step) => step.step.owner)).toEqual([
        'task-management',
        'captures',
      ]);
    }
  });

  it('skips a policy that returns null', async () => {
    const policies: readonly Policy[] = [
      {
        on: 'TaskDeleted',
        react: () => okAsync(null),
      },
    ];
    const prepared = await prepareCommit({
      works: [work('task-management', ['TaskDeleted'])],
      policies,
      owners: owners('task-management'),
    });

    expect(prepared.isOk()).toBe(true);
    if (prepared.isOk()) {
      expect(prepared.value.steps).toHaveLength(1);
    }
  });

  it('returns the policy refusal and no steps', async () => {
    const refusal: PolicyRefusal = { kind: 'Refused', reason: 'capture-already-gone' };
    const policies: readonly Policy[] = [
      {
        on: 'TaskDeleted',
        react: () => errAsync(refusal),
      },
    ];
    const prepared = await prepareCommit({
      works: [work('task-management', ['TaskDeleted'])],
      policies,
      owners: owners('task-management'),
    });

    expect(prepared.isErr()).toBe(true);
    if (prepared.isErr()) {
      expect(prepared.error).toEqual(refusal);
    }
  });

  it('names the missing participant', async () => {
    const prepared = await prepareCommit({
      works: [work('notes')],
      policies: [],
      owners: owners('captures'),
    });

    expect(prepared.isErr()).toBe(true);
    if (prepared.isErr()) {
      expect(prepared.error).toEqual({
        kind: 'Storage',
        owner: 'notes',
        reason: 'no-participant',
      });
    }
  });
});
