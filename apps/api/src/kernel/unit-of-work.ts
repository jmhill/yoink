import { err, ok, type Result, type ResultAsync } from 'neverthrow';
import type { IntegrationEvent } from './integration-event.js';
import type { ModuleName } from './module-name.js';

/**
 * Opaque plan. Only the owning module's participant understands it.
 * The unit of work does not inspect it.
 */
export type Step = {
  readonly owner: ModuleName;
  readonly plan: unknown;
};

/** Closed. U1 does not add a kind. The owner is the awaited step, not a driver field. */
export type StepFailure = {
  readonly kind: 'Conflict' | 'Storage';
  readonly owner: ModuleName;
  readonly reason: string;
};

export type Work<T, E extends IntegrationEvent = IntegrationEvent> = {
  readonly result: T;
  readonly events: readonly E[];
  readonly step: Step;
};

/**
 * A guarded write reports Conflict when rowsAffected is 0.
 * An ordinary write does not. A read is not a statement the transaction runs.
 */
export type GuardedStatement = {
  readonly sql: string;
  readonly args: readonly unknown[];
  readonly guard: boolean;
};

export type SqlParticipant<P> = {
  readonly owner: ModuleName;
  readonly compile: (plan: P) => readonly GuardedStatement[];
};

export type FakeParticipant<P> = {
  readonly owner: ModuleName;
  readonly apply: (plan: P) => Result<void, StepFailure>;
  readonly snapshot: () => () => void;
};

/** The policy names the refusal. It is not rewritten into a StepFailure kind. */
export type PolicyRefusal = {
  readonly kind: 'Refused';
  readonly reason: string;
};

export type CommitFailure = StepFailure | PolicyRefusal;

export type Policy<E extends IntegrationEvent = IntegrationEvent> = {
  readonly on: E['type'];
  readonly react: (event: E) => ResultAsync<Work<unknown> | null, PolicyRefusal>;
};

export type UnitOfWork = {
  commit: (works: readonly Work<unknown>[]) => ResultAsync<void, CommitFailure>;
};

export type PreparedCommit = {
  readonly steps: readonly Work<unknown>[];
};

const NO_PARTICIPANT = 'no-participant';

/**
 * Policies see the caller's events only. Work returned by a policy is appended
 * and is not fed back into policies. One level, before any participant runs.
 */
export const prepareCommit = async (input: {
  readonly works: readonly Work<unknown>[];
  readonly policies: readonly Policy[];
  readonly owners: ReadonlySet<ModuleName>;
}): Promise<Result<PreparedCommit, CommitFailure>> => {
  const missing = missingOwner(input.works, input.owners);
  if (missing) {
    return err(missing);
  }

  const events = input.works.flatMap((work) => [...work.events]);
  const policyWork = await collectPolicyWork(events, input.policies);
  if (policyWork.isErr()) {
    return err(policyWork.error);
  }

  const missingPolicyOwner = missingOwner(policyWork.value, input.owners);
  if (missingPolicyOwner) {
    return err(missingPolicyOwner);
  }

  return ok({ steps: [...input.works, ...policyWork.value] });
};

const collectPolicyWork = async (
  events: readonly IntegrationEvent[],
  policies: readonly Policy[]
): Promise<Result<readonly Work<unknown>[], PolicyRefusal>> => {
  const produced: Work<unknown>[] = [];
  for (const policy of policies) {
    for (const event of events) {
      if (event.type !== policy.on) {
        continue;
      }
      const reaction = await policy.react(event);
      if (reaction.isErr()) {
        return err(reaction.error);
      }
      if (reaction.value !== null) {
        produced.push(reaction.value);
      }
    }
  }
  return ok(produced);
};

const missingOwner = (
  works: readonly Work<unknown>[],
  owners: ReadonlySet<ModuleName>
): StepFailure | undefined => {
  for (const work of works) {
    if (!owners.has(work.step.owner)) {
      return {
        kind: 'Storage',
        owner: work.step.owner,
        reason: NO_PARTICIPANT,
      };
    }
  }
  return undefined;
};
