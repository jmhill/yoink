import { type Client, type InValue } from '@libsql/client';
import { err, ok, type Result, ResultAsync } from 'neverthrow';
import type { ModuleName } from '../../kernel/module-name.js';
import {
  appendEventSink,
  prepareCommit,
  storageFailure,
  type CommitFailure,
  type EventSink,
  type GuardedStatement,
  type Policy,
  type SqlParticipant,
  type StorageFailure,
  type UnitOfWork,
  type Work,
} from '../../kernel/unit-of-work.js';
import { indexParticipants } from './participants.js';
import { acceptedWrite } from './write-statement.js';

/**
 * The slice of `@libsql/client` U1 uses. `transaction('write')` is the
 * library's immediate transaction. One `batch` sends every statement.
 * This port has no per-statement `execute` and no `execute` for `BEGIN`.
 */
export type WriteTransaction = {
  batch: (
    statements: readonly {
      readonly sql: string;
      readonly args: readonly unknown[];
    }[]
  ) => Promise<readonly { readonly rowsAffected: number }[]>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  /** Rolls back when the transaction is still open. Resolves after the gate is released. */
  close: () => void | Promise<void>;
};

/**
 * A stuck write should fail and release before the caller gives up.
 * Same budget as one request-path Turso call.
 */
export const UNIT_OF_WORK_TRANSACTION_TIMEOUT_MS = 5_000;

/** A local batch is milliseconds. Past this, the write lock has stayed out. */
export const UNIT_OF_WORK_SLOW_TRANSACTION_MS = 1_000;

export type UnitOfWorkClock = {
  now: () => number;
};

const systemClock: UnitOfWorkClock = {
  now: () => Date.now(),
};

/** Failure log. The raw driver message is not a field. */
export type UnitOfWorkLogger = {
  error: (fields: {
    readonly msg: 'unit_of_work_batch_failed';
    readonly reason: string;
    readonly owners: readonly ModuleName[];
    readonly batchSize: number;
    readonly cause: string;
  }) => void;
  warn?: (fields: {
    readonly msg: 'unit_of_work_transaction_slow';
    readonly owners: readonly ModuleName[];
    readonly statementCount: number;
    readonly durationMs: number;
  }) => void;
};

export type WriteClient = {
  transaction: (mode: 'write') => Promise<WriteTransaction>;
};

type Planned = {
  readonly owner: ModuleName;
  readonly statement: GuardedStatement;
};

/**
 * U1. One `tx.batch` inside `client.transaction('write')`.
 * `rowsAffected === 0` on a guarded write is Conflict for that statement.
 * A thrown batch or commit is Storage. The batch is not replayed.
 * A transaction that passes the deadline rolls back, releases, and is Storage.
 * That batch is not run again.
 */
export const createSqliteUnitOfWork = (deps: {
  readonly client: WriteClient;
  readonly participants: readonly SqlParticipant<unknown>[];
  readonly policies?: readonly Policy[];
  readonly sink?: EventSink;
  readonly logger?: UnitOfWorkLogger;
  readonly clock?: UnitOfWorkClock;
  readonly transactionTimeoutMs?: number;
  readonly slowTransactionMs?: number;
}): UnitOfWork => {
  const byOwner = indexParticipants(deps.participants);
  const owners = new Set(byOwner.keys());
  const policies = deps.policies ?? [];

  return {
    commit: (works) =>
      new ResultAsync(
        commitSqlite({
          client: deps.client,
          byOwner,
          owners,
          policies,
          sink: deps.sink,
          logger: deps.logger,
          clock: deps.clock ?? systemClock,
          transactionTimeoutMs: deps.transactionTimeoutMs ?? UNIT_OF_WORK_TRANSACTION_TIMEOUT_MS,
          slowTransactionMs: deps.slowTransactionMs ?? UNIT_OF_WORK_SLOW_TRANSACTION_MS,
          works,
        })
      ),
  };
};

/** Adapts the pinned client. Only `rowsAffected` is kept. */
export const libsqlWriteClient = (client: Client): WriteClient => ({
  transaction: async (mode) => {
    const tx = await client.transaction(mode);
    return {
      batch: async (statements) => {
        const results = await tx.batch(
          statements.map((statement) => ({
            sql: statement.sql,
            args: [...statement.args] as InValue[],
          }))
        );
        return results.map((result) => ({ rowsAffected: result.rowsAffected }));
      },
      commit: () => tx.commit(),
      rollback: () => tx.rollback(),
      close: () => {
        tx.close();
        return Promise.resolve();
      },
    };
  },
});

const commitSqlite = async (input: {
  readonly client: WriteClient;
  readonly byOwner: ReadonlyMap<ModuleName, SqlParticipant<unknown>>;
  readonly owners: ReadonlySet<ModuleName>;
  readonly policies: readonly Policy[];
  readonly sink?: EventSink;
  readonly logger?: UnitOfWorkLogger;
  readonly clock: UnitOfWorkClock;
  readonly transactionTimeoutMs: number;
  readonly slowTransactionMs: number;
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
  const steps = appendEventSink(prepared.value, input.sink);

  const planned: Planned[] = [];
  for (const work of steps.steps) {
    const participant = input.byOwner.get(work.step.owner);
    if (!participant) {
      return err(
        storageFailure(
          steps.steps.map((step) => step.step.owner),
          'no-participant'
        )
      );
    }
    for (const statement of participant.compile(work.step.plan)) {
      planned.push({ owner: work.step.owner, statement });
    }
  }

  for (const step of planned) {
    if (!acceptedWrite(step.statement)) {
      return err(storageFailure(modulesOf(planned), 'read-rejected'));
    }
  }

  if (planned.length === 0) {
    return ok(undefined);
  }

  const modules = modulesOf(planned);
  const started = input.clock.now();
  const result = await runTimedBatch({
    client: input.client,
    logger: input.logger,
    modules,
    planned,
    transactionTimeoutMs: input.transactionTimeoutMs,
  });
  const durationMs = input.clock.now() - started;
  if (durationMs >= input.slowTransactionMs) {
    input.logger?.warn?.({
      msg: 'unit_of_work_transaction_slow',
      owners: storageFailure(modules, 'slow').owners,
      statementCount: planned.length,
      durationMs,
    });
  }
  return result;
};

/**
 * One attempt. The deadline abandons a batch that is still open.
 * Commit is not raced with rollback: the file connection cannot run both.
 * A batch still in flight at the deadline is rolled back and not committed.
 */
const runTimedBatch = (input: {
  readonly client: WriteClient;
  readonly logger?: UnitOfWorkLogger;
  readonly modules: readonly ModuleName[];
  readonly planned: readonly Planned[];
  readonly transactionTimeoutMs: number;
}): Promise<Result<void, CommitFailure>> =>
  new Promise((resolve) => {
    let phase: 'opening' | 'batching' | 'committing' | 'settled' = 'opening';
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tx: WriteTransaction | undefined;

    const clearTimer = (): void => {
      if (timer !== undefined) clearTimeout(timer);
    };

    const failure = (reason: string, caught: unknown): StorageFailure =>
      failedBatch(input.logger, input.modules, input.planned.length, reason, caught);

    void (async () => {
      try {
        tx = await input.client.transaction('write');
      } catch (caught) {
        phase = 'settled';
        resolve(err(failure('transaction-failed', caught)));
        return;
      }

      phase = 'batching';
      const opened = tx;
      timer = setTimeout(() => {
        if (phase !== 'batching') return;
        phase = 'settled';
        clearTimer();
        void abandon(opened).then(() => {
          resolve(err(failure('transaction-timeout', undefined)));
        });
      }, input.transactionTimeoutMs);

      const stop = async (value: Result<void, CommitFailure>): Promise<void> => {
        if (phase !== 'batching') return;
        phase = 'settled';
        clearTimer();
        await abandon(opened);
        resolve(value);
      };

      let results: readonly { readonly rowsAffected: number }[];
      try {
        results = await opened.batch(
          input.planned.map((step) => ({
            sql: step.statement.sql,
            args: step.statement.args,
          }))
        );
      } catch (caught) {
        await stop(err(failure('execute-failed', caught)));
        return;
      }

      if (results.length !== input.planned.length) {
        await stop(err(failure('execute-failed', undefined)));
        return;
      }

      for (let index = 0; index < input.planned.length; index += 1) {
        const step = input.planned[index];
        const rowsAffected = results[index]?.rowsAffected;
        if (step !== undefined && step.statement.guard && rowsAffected === 0) {
          await stop(
            err({
              kind: 'Conflict',
              owner: step.owner,
              reason: guardReason(step.statement.sql),
            })
          );
          return;
        }
      }

      if (phase !== 'batching') return;
      phase = 'committing';
      clearTimer();
      try {
        await opened.commit();
      } catch (caught) {
        await abandon(opened);
        if (phase !== 'committing') return;
        phase = 'settled';
        resolve(err(failure('commit-failed', caught)));
        return;
      }

      try {
        await opened.close();
      } catch {
        if (phase !== 'committing') return;
        phase = 'settled';
        resolve(ok(undefined));
        return;
      }
      if (phase !== 'committing') return;
      phase = 'settled';
      resolve(ok(undefined));
    })().catch(async (caught: unknown) => {
      if (phase === 'settled') return;
      phase = 'settled';
      clearTimer();
      if (tx !== undefined) await abandon(tx);
      resolve(err(failure('execute-failed', caught)));
    });
  });

const GUARD_REASON = /--\s*guard:([a-z0-9-]+)/;

/** A leading `-- guard:<reason>` names the conflict. Anything else stays guard-miss. */
const guardReason = (sql: string): string => GUARD_REASON.exec(sql)?.[1] ?? 'guard-miss';

const modulesOf = (planned: readonly Planned[]): readonly ModuleName[] =>
  planned.map((step) => step.owner);

const SAFE_CAUSE_NAMES = new Set(['Error', 'LibsqlError', 'TypeError', 'RangeError']);

/** Class name only. The message, SQL, arguments, and driver codes stay out. */
export const sanitizedDriverCause = (caught: unknown): string => {
  if (typeof caught !== 'object' || caught === null || !('name' in caught)) {
    return 'Error';
  }
  const name = caught.name;
  if (typeof name === 'string' && SAFE_CAUSE_NAMES.has(name)) {
    return name;
  }
  return 'Error';
};

const failedBatch = (
  logger: UnitOfWorkLogger | undefined,
  modules: readonly ModuleName[],
  batchSize: number,
  reason: string,
  caught: unknown
): StorageFailure => {
  const failure = storageFailure(modules, reason);
  logger?.error({
    msg: 'unit_of_work_batch_failed',
    reason: failure.reason,
    owners: failure.owners,
    batchSize,
    cause: sanitizedDriverCause(caught),
  });
  return failure;
};

/** Rollback, then close. Never commit. Later close or rollback errors stay secondary. */
const abandon = async (tx: WriteTransaction): Promise<void> => {
  try {
    await tx.rollback();
  } catch {
    // The step result is already decided.
  } finally {
    try {
      await tx.close();
    } catch {
      // The step result is already decided.
    }
  }
};
