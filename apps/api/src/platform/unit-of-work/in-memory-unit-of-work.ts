import { err, ok, type Result, ResultAsync } from 'neverthrow';
import type { ModuleName } from '../../kernel/module-name.js';
import {
  appendEventSink,
  prepareCommit,
  storageFailure,
  type CommitFailure,
  type EventSink,
  type FakeParticipant,
  type Policy,
  type UnitOfWork,
  type Work,
} from '../../kernel/unit-of-work.js';
import { indexParticipants } from './participants.js';

/**
 * Test unit of work. Snapshots every fake first. Policies run against that
 * state. Any failure restores every fake, including ones this commit did not apply.
 */
export const createInMemoryUnitOfWork = (deps: {
  readonly participants: readonly FakeParticipant<unknown>[];
  readonly policies?: readonly Policy[];
  readonly sink?: EventSink;
}): UnitOfWork => {
  const byOwner = indexParticipants(deps.participants);
  const owners = new Set(byOwner.keys());
  const policies = deps.policies ?? [];

  return {
    commit: (works) =>
      new ResultAsync(
        commitInMemory({ byOwner, owners, policies, sink: deps.sink, works })
      ),
  };
};

const commitInMemory = async (input: {
  readonly byOwner: ReadonlyMap<ModuleName, FakeParticipant<unknown>>;
  readonly owners: ReadonlySet<ModuleName>;
  readonly policies: readonly Policy[];
  readonly sink?: EventSink;
  readonly works: readonly Work<unknown>[];
}): Promise<Result<void, CommitFailure>> => {
  const restores = [...input.byOwner.values()].map((participant) => participant.snapshot());
  const restoreAll = () => {
    for (const restore of restores) {
      restore();
    }
  };

  const prepared = await prepareCommit({
    works: input.works,
    policies: input.policies,
    owners: input.owners,
  });
  if (prepared.isErr()) {
    restoreAll();
    return err(prepared.error);
  }
  const steps = appendEventSink(prepared.value, input.sink);

  for (const work of steps.steps) {
    const participant = input.byOwner.get(work.step.owner);
    if (!participant) {
      restoreAll();
      return err(
        storageFailure(
          steps.steps.map((step) => step.step.owner),
          'no-participant'
        )
      );
    }
    const applied = participant.apply(work.step.plan);
    if (applied.isErr()) {
      restoreAll();
      if (applied.error.kind === 'Conflict') {
        return err({
          kind: 'Conflict',
          owner: work.step.owner,
          reason: applied.error.reason,
        });
      }
      return err(
        storageFailure(
          steps.steps.map((step) => step.step.owner),
          applied.error.reason
        )
      );
    }
  }

  return ok(undefined);
};
