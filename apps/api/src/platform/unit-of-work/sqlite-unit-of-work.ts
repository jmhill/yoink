import { type Client, type InValue } from '@libsql/client';
import { err, ok, type Result, ResultAsync } from 'neverthrow';
import type { ModuleName } from '../../kernel/module-name.js';
import {
  prepareCommit,
  type CommitFailure,
  type GuardedStatement,
  type Policy,
  type SqlParticipant,
  type StepFailure,
  type UnitOfWork,
  type Work,
} from '../../kernel/unit-of-work.js';
import { indexParticipants } from './participants.js';
import { acceptedWrite } from './write-statement.js';

/**
 * The slice of `@libsql/client` U1 uses. `transaction('write')` is the
 * library's immediate transaction. This port has no `execute` for `BEGIN`.
 */
export type WriteTransaction = {
  execute: (statement: {
    readonly sql: string;
    readonly args: readonly unknown[];
  }) => Promise<{ readonly rowsAffected: number }>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  close: () => void;
};

export type WriteClient = {
  transaction: (mode: 'write') => Promise<WriteTransaction>;
};

type Planned = {
  readonly owner: ModuleName;
  readonly statement: GuardedStatement;
};

/**
 * U1. Each statement is awaited on `client.transaction('write')`.
 * The owner is that step. `rowsAffected === 0` on a guarded write is Conflict
 * `guard-miss`. A thrown execute is Storage `execute-failed`. No driver field
 * is read, and there is no guard table.
 */
export const createSqliteUnitOfWork = (deps: {
  readonly client: WriteClient;
  readonly participants: readonly SqlParticipant<unknown>[];
  readonly policies?: readonly Policy[];
}): UnitOfWork => {
  const byOwner = indexParticipants(deps.participants);
  const owners = new Set(byOwner.keys());
  const policies = deps.policies ?? [];

  return {
    commit: (works) =>
      new ResultAsync(commitSqlite({ client: deps.client, byOwner, owners, policies, works })),
  };
};

/** Adapts the pinned client. Only `rowsAffected` is kept. */
export const libsqlWriteClient = (client: Client): WriteClient => ({
  transaction: async (mode) => {
    const tx = await client.transaction(mode);
    return {
      execute: async (statement) => {
        const result = await tx.execute({
          sql: statement.sql,
          args: [...statement.args] as InValue[],
        });
        return { rowsAffected: result.rowsAffected };
      },
      commit: () => tx.commit(),
      rollback: () => tx.rollback(),
      close: () => {
        tx.close();
      },
    };
  },
});

const commitSqlite = async (input: {
  readonly client: WriteClient;
  readonly byOwner: ReadonlyMap<ModuleName, SqlParticipant<unknown>>;
  readonly owners: ReadonlySet<ModuleName>;
  readonly policies: readonly Policy[];
  readonly works: readonly Work<unknown>[];
}): Promise<Result<void, CommitFailure>> => {
  const prepared = await prepareCommit({
    works: input.works,
    policies: input.policies,
    owners: input.owners,
  });
  if (prepared.isErr()) {
    return err(prepared.error);
  }

  const planned: Planned[] = [];
  for (const work of prepared.value.steps) {
    const participant = input.byOwner.get(work.step.owner);
    if (!participant) {
      return err({
        kind: 'Storage',
        owner: work.step.owner,
        reason: 'no-participant',
      });
    }
    for (const statement of participant.compile(work.step.plan)) {
      planned.push({ owner: work.step.owner, statement });
    }
  }

  for (const step of planned) {
    if (!acceptedWrite(step.statement)) {
      return err({
        kind: 'Storage',
        owner: step.owner,
        reason: 'read-rejected',
      });
    }
  }

  if (planned.length === 0) {
    return ok(undefined);
  }

  let tx: WriteTransaction;
  try {
    tx = await input.client.transaction('write');
  } catch {
    return err({
      kind: 'Storage',
      owner: planned[0].owner,
      reason: 'transaction-failed',
    });
  }

  let lastOwner = planned[0].owner;
  for (const step of planned) {
    lastOwner = step.owner;
    let result: { rowsAffected: number };
    try {
      result = await tx.execute({
        sql: step.statement.sql,
        args: step.statement.args,
      });
    } catch {
      await abandon(tx);
      return err(storage(lastOwner, 'execute-failed'));
    }
    if (step.statement.guard && result.rowsAffected === 0) {
      await abandon(tx);
      return err({
        kind: 'Conflict',
        owner: lastOwner,
        reason: 'guard-miss',
      });
    }
  }

  try {
    await tx.commit();
  } catch {
    await abandon(tx);
    return err(storage(lastOwner, 'commit-failed'));
  }

  try {
    tx.close();
  } catch {
    return ok(undefined);
  }
  return ok(undefined);
};

const storage = (owner: ModuleName, reason: string): StepFailure => ({
  kind: 'Storage',
  owner,
  reason,
});

/** Rollback, then close. Never commit. Later close or rollback errors stay secondary. */
const abandon = async (tx: WriteTransaction): Promise<void> => {
  try {
    await tx.rollback();
  } catch {
    // The step result is already decided.
  } finally {
    try {
      tx.close();
    } catch {
      // The step result is already decided.
    }
  }
};
