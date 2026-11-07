import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { IntegrationEvent } from './integration-event.js';
import type { ModuleName } from './module-name.js';
import {
  appendEventSink,
  prepareCommit,
  type EventSink,
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

describe('appendEventSink', () => {
  it('records caller and policy events once and does not feed the sink back', async () => {
    const prepared = await prepareCommit({
      works: [work('task-management', ['TaskDeleted'])],
      policies: [
        {
          on: 'TaskDeleted',
          react: () => okAsync(work('captures', ['CaptureDeleted'])),
        },
        {
          on: 'CaptureDeleted',
          react: () => okAsync(work('notes')),
        },
      ],
      owners: owners('task-management', 'captures', 'notes'),
    });
    expect(prepared.isOk()).toBe(true);
    if (prepared.isErr()) {
      return;
    }

    const seen: string[] = [];
    const sink: EventSink = {
      owner: 'history',
      prepare: (events) => {
        seen.push(...events.map((item) => item.type));
        return { rows: seen.length };
      },
    };

    const withSink = appendEventSink(prepared.value, sink);
    const again = appendEventSink(withSink, sink);

    expect(seen).toEqual(['TaskDeleted', 'CaptureDeleted', 'TaskDeleted', 'CaptureDeleted']);
    expect(withSink.steps.map((step) => step.step.owner)).toEqual([
      'task-management',
      'captures',
      'history',
    ]);
    expect(withSink.steps[2]?.events).toEqual([]);
    expect(again.steps).toHaveLength(4);
  });

  it('adds no step when prepare has nothing to write', async () => {
    const prepared = await prepareCommit({
      works: [work('captures', ['TaskDeleted'])],
      policies: [],
      owners: owners('captures'),
    });
    expect(prepared.isOk()).toBe(true);
    if (prepared.isErr()) {
      return;
    }
    const sink: EventSink = { owner: 'history', prepare: () => null };
    expect(appendEventSink(prepared.value, sink).steps).toHaveLength(1);
    expect(appendEventSink(prepared.value, undefined).steps).toHaveLength(1);
  });
});
