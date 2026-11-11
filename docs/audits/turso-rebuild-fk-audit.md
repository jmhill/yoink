# Turso table-rebuild foreign key audit

Read-only. Nothing in this note was run against production. The schema at each migration was rebuilt locally by applying every earlier migration to an empty SQLite database, then reading `PRAGMA foreign_key_list` for every table. Production damage is inferred from that schema, from which code path deployed, and from Trunk. Justin runs the queries.

## What the old path did

Before pull request 387 (`6bb9291e`), `rebuildTable` sent `PRAGMA foreign_keys = OFF` with `execute`, then the `CREATE` / `INSERT SELECT` / `DROP` / `RENAME` statements with `batch`. On Turso HTTP each request is a new stream. The pragma never reached the batch. The batch starts a transaction, and `PRAGMA foreign_keys` inside a transaction does nothing. Turso's default is foreign keys on.

SQLite's `DROP TABLE`, with foreign keys on, deletes every row of that table before it drops it. That implicit delete does not run SQL triggers. It does run `ON DELETE` actions, and it fails the statement when a child is `RESTRICT` or `NO ACTION` and a row points at the table. A failed statement rolls the batch back, so a cascade in the same batch does not stick if any `NO ACTION` child still has rows. When the action is omitted, SQLite uses `NO ACTION`. Source: [SQLite foreign keys, section 5](https://www.sqlite.org/foreignkeys.html).

`Database.migrate` (what `rebuildTable` uses after 387) is one request: foreign keys off, then the statements, then foreign keys on, then `PRAGMA foreign_key_check` before commit.

## Which rebuilds ran on the old path

Turso cutover is commit `0d83671d` (2025-12-27, "feat(api): migrate from node:sqlite to @libsql/client"). Migrations 001 through 016 were already in the dump that was imported, so they did not re-run on Turso HTTP. On `node:sqlite` the pragma stayed on the connection, so 007 and 009 ran with foreign keys off.

`rebuildTable` before `6bb9291e` is the old helper. Hand-written `db.batch` drops never called that helper, and on Turso they still ran with foreign keys on.

| Migration | What it dropped | Path | Ran on Turso with foreign keys on? |
|---|---|---|---|
| 007 | `captures` (rename `archived_at` to `trashed_at`) | old helper | No. Pre-Turso. No child foreign keys existed (`tasks` arrives in 011). |
| 009 | `captures` (drop `pinned_at`) | old helper | No. Pre-Turso. Still no child foreign keys. |
| 017 | `invitations` (make `invited_by_user_id` nullable) | old helper | Yes. Added 2025-12-29, after the cutover. No table referenced `invitations`. |
| 020 | `users` (drop `organization_id`) | old helper | Yes. Added 2026-01-02 (`18e89e11`). This is the one that can have deleted or nulled child rows. |
| 029 | `change_log` (add `project` to the subject check) | hand-written `db.batch` | Yes. No table referenced `change_log`. |
| 036 | `change_log` (add `note` to the subject check) | hand-written `db.batch` | Yes. No table referenced `change_log`. |
| 037 | `projects` (add proposal columns) | old helper | Yes. Added 2026-10-13. Children are `NO ACTION`, so a referencing row would have failed the deploy. |
| 042 | `membership_events` | hand-written `db.batch` | Yes. No table referenced `membership_events`. |
| 043 | `invitations` and `membership_events` | hand-written `db.batch` | Yes. No table referenced either. |
| 044 | `change_log` (allow `capture` as a subject) | old helper | Yes. Pull request 319, 2026-11-07. No table referenced `change_log`. |
| 047 | `tasks` (drop the captures foreign key) | old helper, then the fixed helper | The old path was attempted and did not commit. Trunk run [42910447167](https://github.com/jmhill/yoink/actions/runs/42910447167) (pull request 383, `4a583b08`) failed in Deploy: `Migration 47 (drop_task_capture_foreign_key) failed: SQLITE_CONSTRAINT: SQLite error: FOREIGN KEY constraint failed`. The child was `projects.next_action_task_id`. Pull request 387 (`6bb9291e`, Trunk [42924967676](https://github.com/jmhill/yoink/actions/runs/42924967676)) applied 047 through `Database.migrate`. |
| 048 | `project_notes` (drop the projects foreign key) | fixed helper | No. It shipped after the fix. Trunk [42939409979](https://github.com/jmhill/yoink/actions/runs/42939409979) on `166a1201` passed. |

016 is a unique index, not a rebuild. 020 also runs `DROP TABLE IF EXISTS users_new` as leftover cleanup of an unused name. That is not a second copy of `users`.

## Damage table

"Own foreign keys" are constraints on the dropped table. Dropping a child does not delete or null the parent, so those rows are not the damage. They are listed so the picture is complete.

`ON DELETE` is the action as the schema stood at that migration, not today's schema.

| Migration | Dropped parent | Child | ON DELETE | Likely damage |
|---|---|---|---|---|
| 007 | `captures` | none | — | None. Pre-Turso, and no child existed. Own foreign keys: none. |
| 009 | `captures` | none | — | None. Same as 007. |
| 017 | `invitations` | none | — | None. Own foreign keys: `organization_id` → `organizations.id` CASCADE, `invited_by_user_id` → `users.id` NO ACTION, `accepted_by_user_id` → `users.id` NO ACTION. |
| 020 | `users` | `organization_memberships.user_id` | CASCADE | Rows deleted, if the batch committed and those rows existed. `users` itself was copied first, so user rows remain. |
| 020 | `users` | `passkey_credentials.user_id` | CASCADE | Rows deleted, on the same condition. |
| 020 | `users` | `user_sessions.user_id` | CASCADE | Rows deleted, on the same condition. Sessions also expire after 7 days and a cleanup job removes them, so a missing January session in November is not evidence. |
| 020 | `users` | `invitations.invited_by_user_id` | SET NULL | Column set to null, on the same condition. Owner invites and admin invites created with no inviter are legitimately null later. See the query notes. |
| 020 | `users` | `invitations.accepted_by_user_id` | NO ACTION | The migration would have failed if any invite had been accepted. 020 is applied, so either no invite had `accepted_by_user_id` set, or foreign keys were not enforced. The queries separate those. |
| 020 | `users` | `tasks.created_by_id` | NO ACTION | The migration would have failed if any task existed (`created_by_id` is `NOT NULL`). Same reading as `accepted_by_user_id`. |
| 020 | `users` | — | — | `api_tokens.user_id` and `captures.created_by_id` are not foreign keys. Those rows survive a cascade and are the best leftover signal. `users` itself had no foreign keys (`organization_id` was a plain column). `lists` did not exist yet. `change_log` (028) and `membership_events` (041) did not exist yet. |
| 029 | `change_log` | none | — | None from a child action. Rows were copied, then the old table was dropped. Own foreign key: `organization_id` → `organizations.id` NO ACTION. |
| 036 | `change_log` | none | — | None from a child action. Same own foreign key. `project_notes` is created in this migration; it is not a child of the dropped `change_log`. |
| 037 | `projects` | `tasks.project_id` | NO ACTION | Would have failed the migration if any task pointed at a project. No cascade, so a surviving task was not deleted by this drop. |
| 037 | `projects` | `project_notes.project_id` | NO ACTION | Would have failed the migration if any note existed (`project_id` is `NOT NULL`). A note dated before version 37 is the solid signal. |
| 037 | `projects` | — | — | Own foreign keys: `organization_id` → `organizations.id` NO ACTION, `created_by_id` → `users.id` NO ACTION, `next_action_task_id` → `tasks.id` NO ACTION. `change_log.project_id` is a column with no foreign key. |
| 042 | `membership_events` | none | — | None from a child action. Own foreign key: `organization_id` → `organizations.id` NO ACTION. The 041 table had no user foreign keys. |
| 043 | `invitations` | none | — | None from a child action. Own foreign keys: `organization_id` CASCADE, `invited_by_user_id` SET NULL, `accepted_by_user_id` NO ACTION. |
| 043 | `membership_events` | none | — | None from a child action. Own foreign key: `organization_id` NO ACTION. |
| 044 | `change_log` | none | — | None from a child action. Own foreign key: `organization_id` NO ACTION. Rows, including `seq`, were copied. |
| 047 | `tasks` | `projects.next_action_task_id` | NO ACTION | The old path failed and rolled back. The applied migration used `Database.migrate`. No production damage from the failed attempt. Own foreign keys at that moment: `capture_id`, `created_by_id`, `organization_id`, `project_id`, `list_id`, each NO ACTION. |
| 048 | `project_notes` | none | — | After the fix. Own foreign keys: `organization_id`, `project_id`, `created_by`, `updated_by`, each NO ACTION. Not a damage candidate. |

The four children named for 020 are right: memberships, passkeys, and sessions cascade, and `invitations.invited_by_user_id` is `SET NULL`. Two more children existed at that moment. `tasks.created_by_id` and `invitations.accepted_by_user_id` are `NO ACTION`. If either had a row, the whole batch rolled back and the cascades did not commit. 020 is in `_migrations` (047's deploy got as far as running 047, which means 001 through 046 were already recorded). So at commit time there was no task and no accepted invitation, or foreign keys were not actually on. There is no second dump after the Turso cutover that would have applied 020 locally and imported it.

`users` rows are copied before the drop. A missing user is not what this bug does. A user with no membership, no passkey, or a nulled inviter is.

## How to read a result

`_migrations.applied_at` is the ISO timestamp the migrator stored (`new Date().toISOString()`). Compare row timestamps to that value, not to a date guessed from git.

A healthy database has the "healthy" result under each query. A count of zero on a `NO ACTION` child dated before the migration means the drop was allowed to commit, and the `CASCADE` / `SET NULL` children of that same drop could have been changed. A count above zero on that `NO ACTION` child means the drop could not have committed with foreign keys on, so a missing membership is not this bug.

These are `SELECT` only. Do not run `PRAGMA foreign_keys = OFF`, `UPDATE`, `DELETE`, or `INSERT`.

### When each migration was applied

Purpose: the timestamps the other queries compare against.

```sql
SELECT version, name, applied_at
FROM _migrations
WHERE version IN (7, 9, 17, 20, 29, 36, 37, 42, 43, 44, 47, 48)
ORDER BY version;
```

Healthy: one row per version, `applied_at` non-null. Version 47's timestamp is the successful migrate from pull request 387, not the failed deploy.

### 020: could the drop have committed?

Purpose: a task created before 020 blocks the drop, because `created_by_id` is `NOT NULL` and `NO ACTION`.

```sql
SELECT COUNT(*) AS tasks_created_before_020
FROM tasks
WHERE created_at < (SELECT applied_at FROM _migrations WHERE version = 20);
```

Healthy, for the cascade theory: `0`. Above zero: 020 could not have committed with foreign keys on, and the cascade queries below are not evidence of this bug.

Purpose: an invitation already accepted before 020 also blocks the drop.

```sql
SELECT COUNT(*) AS invites_accepted_before_020
FROM invitations
WHERE accepted_by_user_id IS NOT NULL
  AND accepted_at < (SELECT applied_at FROM _migrations WHERE version = 20);
```

Healthy, for the cascade theory: `0`. An invite created before 020 and accepted after it was not a blocking row at the time.

### 020: memberships

Purpose: users copied by the rebuild whose membership was deleted and not replaced by the original backfill. Migration 018 set `joined_at` to `users.created_at`, which is before version 20.

```sql
SELECT u.id, u.email, u.kind, u.created_at
FROM users u
WHERE u.created_at < (SELECT applied_at FROM _migrations WHERE version = 20)
  AND NOT EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.user_id = u.id
      AND m.joined_at <= (SELECT applied_at FROM _migrations WHERE version = 20)
  );
```

Healthy: zero rows. A row whose only membership has `joined_at` after version 20 was reattached later.

Purpose: tokens have no foreign key to `users`, so a cascade leaves them behind.

```sql
SELECT t.id, t.user_id, t.organization_id, t.created_at
FROM api_tokens t
WHERE t.created_at < (SELECT applied_at FROM _migrations WHERE version = 20)
  AND NOT EXISTS (
    SELECT 1 FROM organization_memberships m WHERE m.user_id = t.user_id
  );
```

Healthy: zero rows.

### 020: passkeys

Purpose: a human who existed before 020 and now has no passkey. Agents have no passkeys by design, and `kind` was added in 021 with default `human`, so a user created before 020 is a human. Someone can also delete a passkey later. Read this next to the blocking-task query.

```sql
SELECT u.id, u.email, u.created_at
FROM users u
WHERE u.created_at < (SELECT applied_at FROM _migrations WHERE version = 20)
  AND u.kind = 'human'
  AND NOT EXISTS (
    SELECT 1 FROM passkey_credentials p WHERE p.user_id = u.id
  );
```

Healthy: zero rows.

### 020: sessions

Purpose: show that January sessions are not a useful signal. The table keeps a session for 7 days, and cleanup deletes expired rows. By November 2026 a session from the 020 deploy is gone either way.

```sql
SELECT COUNT(*) AS sessions_from_before_020
FROM user_sessions
WHERE created_at < (SELECT applied_at FROM _migrations WHERE version = 20);
```

Healthy: `0`, and that result does not mean the cascade fired.

### 020: invitations whose inviter was cleared

Purpose: member and admin invites created before 020 whose inviter is null. Owner invites (`role = 'owner'`) must have a null inviter after 043, so they are excluded. Admin invites created with no user between 017 and 020 are also legitimately null. If every pre-020 member invite is null and none still have an inviter, that is the `SET NULL` signature.

```sql
SELECT
  SUM(CASE WHEN invited_by_user_id IS NULL THEN 1 ELSE 0 END) AS nulled,
  SUM(CASE WHEN invited_by_user_id IS NOT NULL THEN 1 ELSE 0 END) AS kept
FROM invitations
WHERE role IN ('admin', 'member')
  AND created_at < (SELECT applied_at FROM _migrations WHERE version = 20);
```

Healthy: `nulled` is 0, or both are 0 because no such invite existed. Damage: `nulled` above 0 and `kept` is 0.

There is no history table from that week. `change_log` starts at 028 and `membership_events` starts at 041, both after 020, so neither can show the original inviter.

### 037: did a child exist?

Purpose: a note is created with `project_id NOT NULL`. A note older than version 37 means a `NO ACTION` child existed, so the drop could not commit with foreign keys on. The note would still be there, because `NO ACTION` does not delete it.

```sql
SELECT COUNT(*) AS notes_created_before_037
FROM project_notes
WHERE created_at < (SELECT applied_at FROM _migrations WHERE version = 37);
```

Healthy: either `0` (nothing for this drop to trip on) or above `0` (the children survived). Neither result is a deleted row.

Purpose: tasks can gain `project_id` after they are created, so `created_at` is a weaker signal. Still worth listing.

```sql
SELECT COUNT(*) AS tasks_with_project_before_037
FROM tasks
WHERE project_id IS NOT NULL
  AND created_at < (SELECT applied_at FROM _migrations WHERE version = 37);
```

Healthy: same reading as the notes count. Do not treat zero as deleted tasks.

Purpose: the rebuild copies `projects` before the drop, so a child pointing at a missing project is a later delete, not this rebuild. There is no delete-project command.

```sql
SELECT 'task' AS kind, id, project_id
FROM tasks
WHERE project_id IS NOT NULL
  AND project_id NOT IN (SELECT id FROM projects)
UNION ALL
SELECT 'note', id, project_id
FROM project_notes
WHERE project_id NOT IN (SELECT id FROM projects);
```

Healthy: zero rows.

Purpose: `change_log.project_id` and `subject_id` are not foreign keys. A project subject with no project row is the same later-delete check.

```sql
SELECT id, subject_id
FROM change_log
WHERE subject_type = 'project'
  AND subject_id NOT IN (SELECT id FROM projects);
```

Healthy: zero rows.

### 017, 029, 036, 042, 043, 044: no child to damage

Purpose: confirm that nothing today references the tables those migrations dropped. Nothing referenced them at the time either. A row count cannot show a deleted child that never existed. `change_log`, `membership_events`, and `invitations` were copied before their own drops, so their rows are the rebuilt rows.

```sql
SELECT m.name AS child_table, f."from" AS child_column, f."table" AS parent_table, f.on_delete
FROM sqlite_master m
JOIN pragma_foreign_key_list(m.name) f
WHERE m.type = 'table'
  AND f."table" IN ('change_log', 'membership_events', 'invitations');
```

Healthy: zero rows.

### 047: the failed attempt did not land

Purpose: `projects.next_action_task_id` is the child that failed the old path. After the rollback and the later migrate, every next-action id still points at a task.

```sql
SELECT id, next_action_task_id
FROM projects
WHERE next_action_task_id IS NOT NULL
  AND next_action_task_id NOT IN (SELECT id FROM tasks);
```

Healthy: zero rows.

### Whole database

Purpose: current foreign-key violations. This does not recover rows a cascade already deleted. Those rows are gone and the remaining references are valid.

```sql
SELECT * FROM pragma_foreign_key_check;
```

Healthy: zero rows.

## Branch the production database before Deploy

Not built. This is the shape of a Trunk job that would have caught 047 before it reached Fly.

Trunk's Migration Validation job (`.github/workflows/trunk.yml`, job `migration-check`) reads the deployed version from production with the read-only token, then runs pending migrations on a local file. That file has no production rows, so a `NO ACTION` child that exists only in production does not fail the job. 047 passed that job and failed on the production deploy.

### Steps

1. Keep the job on trunk, after quality and before Deploy. Do not run it on every pull request.
2. Create a database in the same Turso group from production: `turso db create ci-<github-run-id> --from-db <production-db> --group <group>`. The Platform API equivalent is `POST https://api.turso.tech/v1/organizations/{organizationSlug}/databases` with a seed of type `database`. The branching doc's JSON example is missing a quote; the CLI is the clearer call. `--timestamp` (point-in-time) is available when the copy should be a frozen moment. A branch of current production is the right check for the migrations about to deploy.
3. Mint a SQL token for that new database only.
4. Run the pending migrations against the branch. Then `SELECT * FROM pragma_foreign_key_check`. Then compare per-table row counts taken before the migrations with counts taken after. Fail the job if the check returns any row, or if a count drops on a table the migration does not mean to delete. A rebuild copies rows, so the count stays the same.
5. Delete the branch in `finally`, including when the migration fails. Do not print row contents.
6. Leave the existing read-only version check in place until this job has passed once. Never point a write token at `yoink-prod`.

### Secrets and scopes

A group-scoped platform token, separate from the app's SQL token and from `TURSO_AUTH_TOKEN_READONLY`. Scopes: `read`, `db:create` (create, seed, and restore), `db:delete`, `db:mint-token`. Do not grant `db:rotate-creds` or `group:rotate-creds`; those invalidate live SQL tokens. The production read-only SQL token stays the only credential that touches the real database, and only for the version read, until the branch job replaces that read.

The organization slug, group name, and source database name are settings, not secrets.

Auth scopes: [Turso API authentication](https://docs.turso.tech/api-reference/authentication). Branching: [Turso branching](https://docs.turso.tech/features/branching). Point-in-time: [point-in-time recovery](https://docs.turso.tech/features/point-in-time-recovery).

### Time

Not measured. Copying production was out of scope. The copy is the slow part; the migrations and the counts are not. For this personal inbox, budget a few minutes on the migration-check job and time it once against a non-production database of similar size.

### Cost

Fetched 2026-11-11 from [turso.tech/pricing](https://turso.tech/pricing):

- Free $0, Developer $4.99, Scaler $24.92, Pro $416.58 per month.
- The page says point-in-time restore and database branching do not add a separate usage charge.
- A branch is still a database. It counts toward the database quota, the copy counts as rows read, the migrations count as rows written, and the copy's storage counts while it exists. Overage is billed from the plan table.
- The Free column shows 100 databases, 500 million monthly rows read, and 1 day of point-in-time restore. Developer, Scaler, and Pro show 3, 14, and 90 days on that page.
- The point-in-time doc says a different retention for the middle plans: Free 24 hours, Developer 10 days, Scaler 30 days, Pro 90 days. Read both pages before picking a plan. Do not treat one of those middle numbers as settled.
- Paid plans can restore a deleted database for up to 5 days, so a destroyed CI branch is not gone the moment the job deletes it.

A short-lived branch of this database is one extra database for the minutes the job runs, plus one full read of production.

### Privacy

The branch is a full copy of production: captures, email addresses, invitation addresses, token hashes, passkey public keys, and sessions. It lives in the same Turso organization. A GitHub-hosted runner connects to it. Logs must not select those rows. On a paid plan the deleted database can be restored for days after the job. This needs Justin's approval before anyone adds the token.

### Recommendation

Add the branch job on trunk only, after Justin accepts that copy. The test wrapper in this pull request fails the old pragma-then-batch path without any production data, which is the bug class. The branch is what catches a failure that depends on real rows, which is what 047 hit and what a local empty database cannot see. Keep the read-only version check until the branch job has passed. Do not build it in this pull request.
