import { err, ok, type Result, ResultAsync } from 'neverthrow';
import type { ModuleName } from '../../kernel/module-name.js';
import {
  prepareCommit,
  type CommitFailure,
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
}): UnitOfWork => {
  const byOwner = indexParticipants(deps.participants);
  const owners = new Set(byOwner.keys());
  const policies = deps.policies ?? [];

  return {
    commit: (works) =>
      new ResultAsync(commitInMemory({ byOwner, owners, policies, works })),
  };
};

const commitInMemory = async (input: {
  readonly byOwner: ReadonlyMap<ModuleName, FakeParticipant<unknown>>;
  readonly owners: ReadonlySet<ModuleName>;
  readonly policies: readonly Policy[];
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

  for (const work of prepared.value.steps) {
    const participant = input.byOwner.get(work.step.owner);
    if (!participant) {
      restoreAll();
      return err({
        kind: 'Storage',
        owner: work.step.owner,
        reason: 'no-participant',
      });
    }
    const applied = participant.apply(work.step.plan);
    if (applied.isErr()) {
      restoreAll();
      return err({
        kind: applied.error.kind,
        owner: work.step.owner,
        reason: applied.error.reason,
      });
    }
  }

  return ok(undefined);
};
