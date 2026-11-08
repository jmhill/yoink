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

/**
 * Closed. Conflict names the guarded statement. Storage names every module
 * in the batch, and `owner` only when they are all the same module.
 * There is no `owner: null`, and no caller branches on `Storage.owner`.
 */
export type ConflictFailure = {
  readonly kind: 'Conflict';
  readonly owner: ModuleName;
  readonly reason: string;
};

export type StorageFailure = {
  readonly kind: 'Storage';
  readonly owner?: ModuleName;
  readonly owners: readonly ModuleName[];
  readonly reason: string;
};

export type StepFailure = ConflictFailure | StorageFailure;

/** `owner` is set only when every module in `modules` is that one module. */
export const storageFailure = (
  modules: readonly ModuleName[],
  reason: string
): StorageFailure => {
  const owners: ModuleName[] = [];
  for (const moduleName of modules) {
    if (!owners.includes(moduleName)) {
      owners.push(moduleName);
    }
  }
  if (owners.length === 1) {
    const owner = owners[0];
    if (owner !== undefined) {
      return { kind: 'Storage', owner, owners, reason };
    }
  }
  return { kind: 'Storage', owners, reason };
};

export type Work<T, E extends IntegrationEvent = IntegrationEvent> = {
  readonly result: T;
  readonly events: readonly E[];
  readonly step: Step;
};

/** The only statements a unit of work may run. A CTE is not one of these. */
export const WRITE_VERBS = ['insert', 'update', 'delete'] as const;

export type WriteVerb = (typeof WRITE_VERBS)[number];

/**
 * One write. `verb` is the supported statement, and `sql` must be that single
 * statement. A guarded write reports Conflict when rowsAffected is 0.
 * An ordinary write does not. Reads are not statements the transaction runs.
 */
export type GuardedStatement = {
  readonly verb: WriteVerb;
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

/**
 * History's event sink. `prepare` sees the events already on the commit,
 * including one level of policy work, and returns an opaque plan.
 * `null` means there is nothing to write. The plan is not an integration
 * event, so policies do not run on it.
 */
export type EventSink = {
  readonly owner: ModuleName;
  readonly prepare: (events: readonly IntegrationEvent[]) => unknown | null;
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

/** Appends the sink step after policies. Does not call policies again. */
export const appendEventSink = (
  prepared: PreparedCommit,
  sink: EventSink | undefined
): PreparedCommit => {
  if (sink === undefined) {
    return prepared;
  }
  const events = prepared.steps.flatMap((step) => step.events);
  const plan = sink.prepare(events);
  if (plan === null) {
    return prepared;
  }
  const sinkWork: Work<null> = {
    result: null,
    events: [],
    step: { owner: sink.owner, plan },
  };
  return { steps: [...prepared.steps, sinkWork] };
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
  if (works.every((work) => owners.has(work.step.owner))) {
    return undefined;
  }
  return storageFailure(
    works.map((work) => work.step.owner),
    NO_PARTICIPANT
  );
};
