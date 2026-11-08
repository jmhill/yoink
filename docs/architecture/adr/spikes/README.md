# M0.2 spike evidence

U1 is the chosen unit of work. U2 is not confirmed. The decision and the classification rules stay in ADR-001 §6.1 and §12. This file is the run log. The sanitized reports next to it are the stored measurements. They are not rewritten.

No GitHub issue exists for M0.2. The technical work is complete. Do not create one.

## Reports

- Local U2: [m0-2-u2-batch.local.json](./m0-2-u2-batch.local.json)
- Remote U2, 2026-11-06 8:28 CT: [m0-2-u2-batch.remote.json](./m0-2-u2-batch.remote.json)
- Remote U1, 2026-11-06 8:48 CT: [m0-2-u1-transaction.remote.json](./m0-2-u1-transaction.remote.json)

## Runners removed

The throwaway runners and their bundles are gone from the tree. The last tree that contains them is [`d68e766292c419dec56841f8768b6afc01312353`](https://github.com/jmhill/yoink/tree/d68e766292c419dec56841f8768b6afc01312353/docs/architecture/adr/spikes). The U2 bundle was built from `1435cffa7996df62a42b201d6a2fd0e76a50e6f5`. The U1 bundle was built from `9e782fb56a09949628d55f57f99b528de50eb7c9`. The record landed on main in `0d2a87077dce8dbdd0bbf0546607adb01ed9ca29` ([#312](https://github.com/jmhill/yoink/pull/312)).

Do not run either runner again. Both left tables in `yoink-m02-spike`. `jhtc-yoink` was not queried. This was not `yoink-prod`.

## U2 local, 2026-11-06

Not confirmed. File database, Node v24.22.2, `@libsql/client` 0.15.15. `PRAGMA foreign_keys` read back `1`. `changes()` was `1` after a matching update and `0` after a missing id. A later 0-row update still failed its assertion when an earlier statement in that batch had changed a row.

A 5-statement matching batch committed in 0.7 ms. A stale capture guard and a stale task guard each rolled the batch back. The guard failure was `SQLITE_CONSTRAINT_CHECK`, `rawCode` 275. A duplicate primary key was `SQLITE_CONSTRAINT_PRIMARYKEY`, `rawCode` 1555. Neither error had a statement index.

1,000 updates plus 1,000 history inserts (2,000 statements) committed in 73.8 ms. The same shape plus 1,000 assertions (3,000 statements) committed in 83.6 ms.

## U2 remote, 2026-11-06 8:28 CT

Not confirmed. One run, exit 0, about 5.6 seconds, stderr empty. Node v22.23.2, `@libsql/client` 0.15.15. Host `libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io`. Bundle sha256 `c3bdf00e2556343d1b5fd70b279d02179e237070109dc052be21b252db92f813`.

`PRAGMA foreign_keys` read back `1`. Matching batch 115.9 ms. Stale capture guard 94.7 ms, rolled back. Stale task guard 98.4 ms, rolled back. Duplicate primary key 110.3 ms, rolled back. 2,000 statements committed in 494.3 ms. 3,000 statements committed in 728.9 ms. Those are the sizes that were run. The timings are one sample.

Every failed batch reported `code` `SQLITE_CONSTRAINT`, `rawCode` null, `index` null, on the error and on its cause. A guard failure and a duplicate key are not distinguishable. `StepFailure.owner` cannot be read from those fields. The local map from `SQLITE_CONSTRAINT_CHECK` to Conflict does not describe this result.

## U1 local, 2026-11-06

File proof only, not the Turso result. Classification used the awaited step and `rowsAffected`. A stale capture guard mapped `{ kind: 'Conflict', owner: 'captures', reason: 'guard-miss' }` with no driver error, and the later history insert in that transaction did not run. A duplicate primary key mapped `{ kind: 'Storage', owner: 'task-management', reason: 'execute-failed' }`. The check probe threw and was not classified. Local codes differed from Turso (`SQLITE_CONSTRAINT_CHECK` / `SQLITE_CONSTRAINT_PRIMARYKEY`, with `rawCode`, and `index` null). That difference is not a claim about Turso.

## U1 remote, 2026-11-06 8:48 CT

One run, exit 0, `durations.processMs` 7366.9, stderr empty. Same host, Node, and client as the U2 remote run. Bundle sha256 `f8c8aef03221fc2a5298157808badc08c2abe260ec6d9e9238eae542c74a47e4`. Report sha256 `4944aa9a6c677e0ad1db7beca21b06470938a14e19845953bc554d9195de19b1`.

`readsInsideTransaction` is false. `manualBegin` is false. `timeout.configuredMs` is null. The longest transaction was the check probe at 481.5 ms. The process duration is not a configured timeout.

| Criterion | Result |
|---|---|
| Matching commit | Met. 406.2 ms. `rowsAffected` 1, 1, 1. Task `after`, capture `processed`, history 1. |
| Stale-guard rollback | Met. 378.9 ms. Stopped at capture `rowsAffected` 0. No commit. Task `before`, history 0. Conflict owner `captures`. |
| Primary-key rollback | Met. 458.1 ms. Task `before`, capture `inbox`, history 0. Storage owner `task-management`. |
| Check probe | Corroboration only. 481.5 ms. Thrown, rolled back, `mapped` null. |
| Driver `code` / `rawCode` / `index` | Both thrown errors are `SQLITE_CONSTRAINT`, null, null. Not used to classify. |
| Foreign keys | Inconclusive. Stored `foreignKeys` is null because the reader asked for column `value`. `PRAGMA foreign_keys` returns column `foreign_keys`. M4.1 tests foreign keys. This does not leave M0.2 open. |
| Statement index | Null. U1 does not need it. The owner is the awaited step. |

Parent accepted U1 at 2026-11-06 8:37 CT as the §12 fallback, after review of `0fd9fb8`. The acceptance adds no failure kind and no product behavior. No production unit of work was added by this spike. M4.1 then shipped the per-statement transaction. M4.1b ([#325](https://github.com/jmhill/yoink/issues/325)) is the later one-batch proof. It does not rerun these runners.

## M4.1b remote proof, 2026-11-07 7:28 CT

Passed once. Exit 0. Test database only (`yoink-m02-spike`), with the existing scoped test token. Not `yoink-prod`. The M0.2 runners were not rerun. The sanitized report is [m4-1b-u1-batch.remote.json](./m4-1b-u1-batch.remote.json). No runner, bundle, or lockfile is stored for this proof. Base main in the report is `d68e766292c419dec56841f8768b6afc01312353`. Node v22.23.2, `@libsql/client` 0.15.15. `durations.processMs` is 5740.2. The client API in the report is `client.transaction('write')` and then one `tx.batch`. It is not `client.batch(statements, mode)`.

This pass does not close [#325](https://github.com/jmhill/yoink/issues/325). The sqlite unit of work still awaits one `execute` per statement. The implementation is blocked, not ready, and not done. M5.1, M5.3, and M5.5 stay gated on the implementation, its tests, review, and merge.

| Check | Result |
|---|---|
| Zero-row update | Passed. `rowsAffected` `[1, 0, 1, 1]`. The batch continued. That proof then rolled back: item count 0, note count 0. |
| Rollback | Passed. Rolled-back `rowsAffected` `[1, 0, 1]`. Afterwards the kept title is `kept`, the other title is null, item count 1, note count 0. The earlier committed row survived. |
| 2,000 statements | Passed. One `tx.batch` of 1,000 updates and 1,000 inserts. `batchMs` 374.1. `finishMs` 174.2. `openMs` 0. Those phases sum to 548.3. Historical U2 `client.batch` for 2,000 statements was 494.3 ms. That run was not repeated. |
| 3,000 statements | Passed. One `tx.batch` of 2,000 updates and 1,000 inserts. `batchMs` 346.3. `finishMs` 191.9. `openMs` 0. Those phases sum to 538.2. Historical U2 for 3,000 statements was 728.9 ms and included 1,000 guard assertions. The shapes differ, so the comparison is approximate. That run was not repeated. |
| HTTP fetches | 2 per measured batch: `batch` 1, `finish` 1, `open` 0. The same 2 on the 2,000-statement batch and the 3,000-statement batch. Not 3. |
| Cleanup | Both proof tables dropped. `remaining` 0. |

A duplicate primary key threw `LibsqlError` `SQLITE_CONSTRAINT`, with `rawCode` null and `index` null, on the error and on its cause. The public `tx.batch` error has no SQL statement index. Guard-miss owner mapping from the result index works, and a single-owner batch still names that owner. A thrown execute in a mixed-owner batch cannot recover an owner. A proposal, not approved, is `Storage` with `owner: null` for that mixed-owner case only. ADR §6.1 is unchanged until Justin answers. The implementation stays blocked. This log does not choose a mapping.

## M0.3 oRPC spread

No sanitized JSON report was committed. The measured choices and constraints stay in ADR §9. The throwaway source was `apps/api/spikes/m0-3/` (`m0-3-spread.ts` and `tsconfig.json`, 237 lines). It is removed. The same bytes remain at [`d68e766292c419dec56841f8768b6afc01312353`](https://github.com/jmhill/yoink/tree/d68e766292c419dec56841f8768b6afc01312353/apps/api/spikes/m0-3), introduced in `b30fe62241ef3335fc058d34f100f55b4a3672e1`. That link is history, not a path to run.
