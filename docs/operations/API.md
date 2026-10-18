# API

Yoink’s HTTP API is token-authenticated (`Authorization: Bearer <tokenId:secret>`).
List endpoints never omit a page marker: every list response includes `hasMore`
(boolean) and `nextCursor` (`string` or explicit `null` when the page is the
last). They also include `total` (the matching row count).

Working-set reads — a named list’s pile, Unlisted, Today, Upcoming, Mine, the
open-task feed (`filter=all`), Inbox, Snoozed, named lists, Now
(`GET /api/work/next-actions`, `GET /api/work/due`, `GET /api/work/lists`),
and project notes (`GET /api/projects/:id/notes`) —
return the whole pile in **one request**, up to a safety cap of 1000. If that
cap is hit, `hasMore` is `true` and `nextCursor` points at the next page.
History (completed/Done tasks, trashed captures) stays paged (default 50).

Cursors are opaque keysets tagged with the list view (board, completed, pile,
lists, projects, capture feed, snoozed, project/task history, finished project
tasks, work next-actions / due / lists, review, review done, project notes) plus the sort keys for that view.
Resume with
the previous page’s `nextCursor` on the **same** list. A malformed cursor,
a cursor from another view, or the wrong key shape is `400` with
`code: "invalid_cursor"` — never an empty page that looks done. Completing,
uncompleting, trashing, or deleting the cursor item between requests still
returns the remaining rows.

## One request per pile

Bots (Lane, Charlie, Sid) should read a pile with a single GET. Omit `limit`
(or pass `limit=1000`). Do not stop at 50.

```bash
# Open-task feed (what used to silently stop at 50)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/tasks?filter=all"

# Today / Upcoming / Mine
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/tasks?filter=today"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/tasks?filter=upcoming"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/tasks?filter=mine"

# Named list pile
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/lists/$LIST_ID/tasks"

# Unlisted pile
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/unlisted/tasks"

# Named lists
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/lists"

# Now (Work): next actions, due, lists with counts
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/work/next-actions"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/work/due"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/work/lists"

# Inbox (exclude snoozed)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/captures?status=inbox&snoozed=false"

# Projects
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/projects"
```

Example complete response (small board):

```json
{
  "tasks": [ { "id": "…", "title": "Milk" } ],
  "hasMore": false,
  "nextCursor": null,
  "total": 1
}
```

If `hasMore` is `true`, keep going with `cursor` set to `nextCursor`. Never
treat a truncated page as the full pile.

## Work: Now and lists

Now is a read-only working set for the Work screen. Loop while `hasMore` is
true; omit `limit` (or pass `limit=1000`) so a bot gets the full pile in one
request. `owner` is `all` (default) or `me`. `me` keeps only tasks assigned to
the caller (`callerId`, the same rule as `GET /api/tasks?filter=mine`);
unowned rows are left out. A bad `owner` is `400` from query validation.

Viewer today is a pure function of `(now, timeZone)`. Send `timeZone`
(IANA). When it is omitted, today is `(now, America/Chicago)`. There is
no `today=` override. The same `timeZone` query parameter applies to
`GET /api/tasks?filter=today|upcoming`. `GET /api/work/next-actions` does
not take a time zone.

A bad `timeZone` is `400` with `code: "INVALID_TIME_ZONE"`. Other query
validation failures (including a bad `owner`) are `400` with
`code: "VALIDATION_FAILED"`. A cursor from another view is `400` with
`code: "invalid_cursor"`.

`GET /api/work/next-actions` returns `{ items: { task, project: { id, name } }[], hasMore, nextCursor, total }`.
Each row is an **active** project whose `next_action_task_id` points at an
open, non-deleted task in the same org. Waiting, someday, done, and proposed
projects never appear. Order is dated first (earliest `due_date`), then
undated; ties and undated rows sort by project name A–Z, then task id.

`GET /api/work/due` returns `{ tasks, hasMore, nextCursor, total }` using the
same Today rule: open, non-deleted tasks due on or before viewer today, loose
or in a project. Anything already shown as a next action is omitted. Future
loose tasks stay in their lists.

`GET /api/work/lists` returns named lists in `GET /api/lists` order
(`name`, `created_at`, `id`) with `openTaskCount` (every open task on that
list, any owner, project tasks included) plus `unlisted.openTaskCount`.
`owner` does not apply; counts do not change with Mine.

```bash
# Everyone's next actions
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/work/next-actions"

# Only the caller's assigned next actions (person or bot token)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/work/next-actions?owner=me"

# Due on the Chicago calendar day
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/work/due?timeZone=America/Chicago"

# Named lists plus Unlisted counts
curl -sS -H "Authorization: Bearer $BOT_TOKEN" \
  "$API/api/work/lists"
```

Cursors are view-tagged (`work.next-actions`, `work.due`, `work.lists`). A
cursor from another Now endpoint, or a malformed cursor, is `400` with
`code: "invalid_cursor"`.

## Review

Review is the attention list for `/projects`. Loop while `hasMore` is true;
omit `limit` (or pass `limit=1000`) so a bot gets the full pile in one
request. Any token can read it.

Viewer today is a pure function of `(now, timeZone)`. Send `timeZone`
(IANA). When it is omitted, today is `(now, America/Chicago)`, not UTC.
A sent `timeZone` wins. A bad `timeZone` is `400` with
`code: "INVALID_TIME_ZONE"`. A cursor from another view is `400` with
`code: "invalid_cursor"`.

`GET /api/review` returns
`{ today, projects, counts, hasMore, nextCursor, total }`.

Each `projects[]` row is listed once even when it matches two reasons:

- `noNextAction` — status is active or waiting and `nextActionTaskId` is null
  (`counts.noNextAction` still counts active projects only)
- `quiet` — status is active and `daysSinceChange >= 7`
- `waiting` — status is waiting (always listed)

Someday, done, and proposed never appear. `reasons` lists every match.
`daysSinceChange` is calendar days between viewer today and the local date
of `lastChangeAt` in `timeZone`. `daysWaiting` is viewer today minus
`waitingSince`, or null when `waitingSince` is null.

`lastChangeAt` is
`MAX(projects.last_changed_at, projects.created_at, MAX(change_log.occurred_at))`
for that project in the same org, including a task that was moved out or
deleted (its change-log row still carries the old project id). One SQL
query; no new column.

Order is Needs a next action, then quiet, then waiting. Waiting rows are
already in group order: `waitingOn` (case-insensitive trim), groups by
oldest `waitingSince` (nulls last), then name. The grouping UI is the
client's job.

`counts` is `{ noNextAction, quiet, waiting }`. `noNextAction` counts
**active** projects with no next action only — a waiting project with no
next action still has `noNextAction` in `reasons` and a chip, but does
not increment this count. That matches the Review badge:
`counts.noNextAction + counts.quiet` (waiting is not counted). Counts
come from the same Review load as the page, not a second query.

```bash
# Attention list on the Chicago calendar day
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/review?timeZone=America/Chicago"

# Bot: whole pile in one GET
curl -sS -H "Authorization: Bearer $BOT_TOKEN" \
  "$API/api/review?limit=1000"
```

Cursors are view-tagged (`review`). A cursor from Work or another list, or
a malformed cursor, is `400` with `code: "invalid_cursor"`.

## Review: done list

Done list is the finished-this-week pile for `/projects`. A week runs
Monday 00:00 through Sunday 23:59:59 in the **stored** org time zone
(`organizations.time_zone`, default `America/Chicago`). That zone is
read-only on this response as `timeZone`. `#145` Review still uses the
per-request `timeZone` query.

`week` is the Monday as `YYYY-MM-DD`. Omit it for the current week in the
stored zone. A date that is not a Monday, or a Monday after the current
week, is `400` with `code: "INVALID_WEEK"`. A cursor from another view is
`400` with `code: "invalid_cursor"`.

`GET /api/review/done` returns
`{ timeZone, week: { start, end }, previousWeek, nextWeek, groups, otherTaskCount, hasMore, nextCursor, total }`.

`week.start` is Monday, `week.end` is Sunday. `nextWeek` is `null` on the
current week. `groups[]` are projects that have at least one finished
task this week, most recent finish first. Each group is
`{ project, nextAction: { id, title } | null, tasks }`. Tasks are newest
`completedAt` first and include `completedByName` when the completer is
known. A reopened or deleted task drops off. Closed (done) projects still
appear when they have finished tasks.

`otherTaskCount` is how many completions that week have no project. They
are not listed. The web links that line to the existing Done view
(`/tasks?filter=completed`).

Paging is over finished project tasks (`total` / `hasMore` / `nextCursor`,
cap 1000). Omit `limit` (or pass `limit=1000`) so a bot gets the whole
week in one GET.

```bash
# Current week in the stored zone
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/review/done"

# Last week (Monday Oct 5, 2026)
curl -sS -H "Authorization: Bearer $BOT_TOKEN" \
  "$API/api/review/done?week=2026-10-05"

# Page if a week ever hits the cap
cursor=""
while :; do
  page=$(curl -sS -H "Authorization: Bearer $TOKEN" \
    "$API/api/review/done?week=2026-10-05${cursor:+&cursor=$cursor}")
  echo "$page" | jq '.groups, .otherTaskCount, .hasMore'
  more=$(echo "$page" | jq -r '.hasMore')
  [ "$more" = "true" ] || break
  cursor=$(echo "$page" | jq -r '.nextCursor')
done
```

Cursors are view-tagged (`review.done`).

## Projects

Projects are a working set: `GET /api/projects` returns the org's working
projects (`active`, `waiting`, `someday`, `done`) in one request, up to the
1000-item safety cap, with `hasMore` / `nextCursor` / `total` like named
lists. Proposed and declined projects are omitted unless you pass
`?status=`. `status` is a comma-separated list of statuses
(`proposed,declined`). `createdById` filters to that proposer's projects.
A bot that lists proposal statuses without `createdById` is scoped to its
own proposals. Read one with `GET /api/projects/:id`. Edit name,
objective, reason, or suggested next action with `PATCH /api/projects/:id`.
Creating an active project needs a person (session or that person's own
token). An agent token gets `403` (`PROJECT_CREATE_REQUIRES_PERSON`) unless
it sends `status: "proposed"`.

```bash
# Create (person session or the person's own token)
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Garden","objective":"Grow tomatoes"}' \
  "$API/api/projects"

# Working set (active, waiting, someday, done)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/projects"

# A bot's pending and declined proposals in one call
curl -sS -H "Authorization: Bearer $BOT_TOKEN" \
  "$API/api/projects?status=proposed,declined"

# The same list, filtered to one proposer
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/projects?status=proposed,declined&createdById=$BOT_USER_ID"

# Read one
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/projects/$PROJECT_ID"

# Edit name, objective, or notebook pages (bots allowed)
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X PATCH \
  -d '{"name":"Backyard","objective":"Plant herbs","notebookPages":["notes/Harbor shed.md"]}' \
  "$API/api/projects/$PROJECT_ID"
```

Responses include `status` (`active` on person create; `proposed` when a bot
proposes; later `waiting`, `someday`, `done`, or `declined`),
`waitingOn` / `waitingSince` (both `null` unless status is waiting), optional
`objective`, `reason`, `suggestedNextAction`, `notebookPages`
(`{ path, url }[]`, vault `jmhill-personal`), and `lastChangedAt` /
`lastChangedBy` (user ids; resolve names from members).

## Bots propose projects

A bot proposes with `POST /api/projects` and `status: "proposed"`. Optional
`reason` (max 200) and `suggestedNextAction` (max 500) travel with the
proposal. People cannot create `proposed` (`403 PROJECT_PROPOSE_REQUIRES_BOT`).
Bots cannot create `active` / `someday` (`403 PROJECT_CREATE_REQUIRES_PERSON`).

Pending proposals hold their name. Declining frees it. Confirming a
duplicate name is `409 DUPLICATE_PROJECT_NAME`. A pending proposal has no
tasks; the suggested next action becomes a real next-action task on confirm
unless the person clears it.

Person-only outcomes:

```bash
# Confirm as Active (default), Someday, or Waiting. Name, objective, and
# suggested next action are editable.
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' \
  "$API/api/projects/$PROJECT_ID/confirm"

# Turn down (status becomes declined; hidden from default lists)
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$API/api/projects/$PROJECT_ID/decline"

# Undo a turn-down (declined → proposed). Fails 409 if the name is taken.
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$API/api/projects/$PROJECT_ID/restore"
```

`PUT /api/projects/:id/status` cannot enter or leave `proposed` or
`declined`. Confirm returns `{ project, task? }` like set-next-action when
the suggested next action becomes a task. Bots learn the outcome from
`status` and the project timeline (`Lane proposed this project`,
`Justin confirmed it as Active`, `Justin turned it down`,
`Justin restored it`).

## Import projects

Lane (or any bot or person) stages a batch. Staging runs the full
all-or-nothing checks and stores a pending import. Invalid batches are
`400 IMPORT_INVALID` with every per-entry, per-field error and store
nothing. Applying and discarding are person-only (`403
IMPORT_REQUIRES_PERSON` for bots). Apply re-validates against current
data; if anything drifted it returns `400 IMPORT_INVALID` and writes
nothing. Applying or discarding a non-pending import is `409
IMPORT_NOT_PENDING`. `GET /api/projects/imports` returns a lightweight
summary: `preview.projects` is `[]`, `errors` is `[]`, and `preview.totals`
comes from the stored payload (no re-validate). Use `GET …/imports/:id`
for the full preview.

Task-level records written by the import (`via: "import"`) appear on
`GET /api/tasks/:id/history` only. The project timeline is one
`ProjectImported` line: `{who} · Moved in · N tasks` (existing plus new).

Lane's batch is an array of project entries. Each entry can attach existing
open tasks (`existingTaskIds`) and/or create tasks (`newTasks` with a
per-entry `key`). `nextAction` is either `{ "existingTaskId" }` or
`{ "newTaskKey" }`. A waiting project needs `waitingOn`; `waitingSince: null`
means unknown. Preview `warnings` are `{ field, code, message }` — a
non-member assignee is a warning and the task imports unassigned.

```bash
# Stage (bots and people). The response is the id plus the preview.
curl -sS -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projects": [
      {
        "name": "Harbor shed",
        "objective": "Keep the dock usable",
        "status": "active",
        "notebookPages": ["notes/Harbor shed (dock).md"],
        "existingTaskIds": ["'"$TASK_ID"'"],
        "newTasks": [{"key": "hinges", "title": "Order hinges"}],
        "nextAction": {"existingTaskId": "'"$TASK_ID"'"}
      },
      {
        "name": "Permit desk",
        "status": "waiting",
        "waitingOn": "City hall",
        "waitingSince": null,
        "newTasks": [{"key": "call-clerk", "title": "Call the clerk"}],
        "nextAction": {"newTaskKey": "call-clerk"}
      },
      {
        "name": "Winter boat cover",
        "status": "someday",
        "newTasks": [{"key": "measure", "title": "Measure the cockpit"}]
      }
    ]
  }' \
  "$API/api/projects/imports"

# List pending — summary only (preview.projects [] and errors []; totals from the payload)
curl -sS -H "Authorization: Bearer $BOT_TOKEN" \
  "$API/api/projects/imports"

# Read one (recomputes the preview against current data)
curl -sS -H "Authorization: Bearer $BOT_TOKEN" \
  "$API/api/projects/imports/$IMPORT_ID"

# Apply (person session or that person's own token)
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{}' \
  "$API/api/projects/imports/$IMPORT_ID/apply"

# Discard (person only)
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{}' \
  "$API/api/projects/imports/$IMPORT_ID/discard"
```

Change status with `PUT /api/projects/:id/status`. Waiting needs a trimmed
non-blank `waitingOn` and optional `waitingSince` (`YYYY-MM-DD`; omit or
`null` means unknown). Leaving waiting clears both. The same values again
is a no-op (`200`, no change-log record). Only a person can mark a project
done or reopen a done project (`403` for bots). Bots may set `active`,
`waiting`, or `someday`, and may edit waiting on an already-waiting
project. Marking done while the project still has open tasks is `409`
`PROJECT_HAS_OPEN_TASKS` (body includes `openTaskCount`) unless the body
includes `openTasks` of `complete` (finish them, keep `projectId`) or
`remove` (clear `projectId`, leave them open). Finished tasks stay on
the project.

```bash
# Set waiting (since omitted = unknown)
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d '{"status":"waiting","waitingOn":"Contractor"}' \
  "$API/api/projects/$PROJECT_ID/status"

# Mark done and complete open tasks (person only)
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d '{"status":"done","openTasks":"complete"}' \
  "$API/api/projects/$PROJECT_ID/status"
```

A task is in 0 or 1 projects, independently of its list. `POST /api/tasks` and
`POST /api/captures/:id/process` accept optional `projectId`. `PATCH /api/tasks/:id`
with `projectId` sets or replaces; `null` clears; omit leaves it unchanged. Only
open tasks move in or out. A done project is `400`; a project in another org is
`404`. Bots may set or clear a project.

`POST /api/captures/:id/process` (process to a task) is unchanged for bots: same
body, same `201` Task. That write is all-or-nothing — the task and the
capture's processed mark land in one batch, or neither does.

## Process a capture into a project (person only)

`POST /api/captures/:id/process-to-project` creates an `active` or `someday`
project from an inbox capture and marks the capture processed, in one batch.
Bots cannot use it (they propose with `POST /api/projects` and
`status: "proposed"`). A web session or a
person's own token may. The existing `process` route stays a Task response so
bot clients do not change.

Body: `{ "name", "objective"?, "status": "active" | "someday" }`. Name is
trimmed, 1–200, unique in the org. Objective is optional, max 2000.

`201` is `{ "project", "capture" }`. The capture is `processed` with
`processedToType: "project"` and `processedToId` equal to the project id. The
project's history records `ProjectCreated` with the source `captureId`.

| Code | When |
| --- | --- |
| `PROJECT_CREATE_REQUIRES_PERSON` | A bot token called this route (`403`) |
| `DUPLICATE_PROJECT_NAME` | Another project in the org already has that name; capture stays inbox (`409`) |
| `CAPTURE_NOT_IN_INBOX` | Capture is missing from the inbox (trashed or already processed); no project is created (`409`) |
| `CAPTURE_NOT_FOUND` | No capture with that id in this org (`404`) |
| `PROJECT_NAME_BLANK` / `INVALID_PROJECT_NAME` | Name is blank after trim or too long (`400`) |

```bash
# Person session or that person's own token
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"name":"Harbor shed","objective":"Fix the door","status":"active"}' \
  "$API/api/captures/$CAPTURE_ID/process-to-project"

# Someday in the same write — no second status change
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"name":"Later garden","status":"someday"}' \
  "$API/api/captures/$CAPTURE_ID/process-to-project"
```

Open tasks on a project are a working set, newest created first:

```bash
# Create already in a project
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy soil","projectId":"'"$PROJECT_ID"'"}' \
  "$API/api/tasks"

# Set, move, or clear (null)
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X PATCH \
  -d '{"projectId":"'"$PROJECT_ID"'"}' \
  "$API/api/tasks/$TASK_ID"

# Open tasks, newest created first
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/projects/$PROJECT_ID/tasks"

# Set, replace, or clear the next action (bots allowed)
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d '{"taskId":"'"$TASK_ID"'"}' \
  "$API/api/projects/$PROJECT_ID/next-action"

# Create a task in this project and make it the next action
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d '{"newTask":{"title":"Pick the countertop"}}' \
  "$API/api/projects/$PROJECT_ID/next-action"

# Clear
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d '{"taskId":null}' \
  "$API/api/projects/$PROJECT_ID/next-action"
```

`PUT /api/projects/:id/next-action` is one route for set, replace, clear, and
create-and-set. Clearing is a state update (`nextActionTaskId` becomes `null`),
not a resource delete, so it stays on PUT with `{ "taskId": null }` rather than
a separate DELETE. The response is `{ "project", "task"? }`. A project has at
most one next action; setting another replaces it in one
`ProjectNextActionSet` record (`previousTaskId` is the one it replaced).
Setting the same task again, or clearing when there is none, is a no-op
(200, no record). GET project includes `nextActionTaskId`.

## History: loop while `hasMore` is true

Completed tasks, trashed captures, a project's timeline, a task's timeline,
and a project's finished-task list are open-ended. Page with `nextCursor`.
Keep going only while `hasMore` is exactly `true` — do not treat a missing
field, a string, or an empty page as done. `curl -f` exits on `4xx`/`5xx`,
including `400 invalid_cursor` (malformed cursor, wrong view, or wrong shape).
Project and task history default to 50 and cap at 1000. Every history page
includes `historyStartsAt` (`2026-10-10T13:56:00.000Z` — story 2). Hidden
kinds (pin, reorder, list rename) never appear. A `TaskUpdated` that only
changed `projectId` or `openOrder` is hidden; title / due / owner / list
edits show. Actor `name` is the user's `name`, else their `email`; a null
actor is `"Unknown"`.

`GET /api/projects/:id/history` is the project's visible change log, newest
first (`occurredAt`, then `seq`). `GET /api/tasks/:id/history` is that task's
own visible log, including after delete. Pre-import history on a task that
later moved in stays on the task route and is not copied onto the project
timeline — the project timeline starts at the Moved in line. `GET
/api/projects/:id/tasks?status=finished` is the same resource as the open
list, filtered to completed tasks (`completedAt` desc). Omit `status` (or
`status=open`) for the open working set.

```bash
# Done / completed history
cursor=""
while :; do
  qs="filter=completed&limit=50"
  [ -n "$cursor" ] && qs="$qs&cursor=$cursor"
  body=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API/api/tasks?$qs") || exit 1
  echo "$body"
  hasMore=$(printf '%s' "$body" | jq -r .hasMore)
  [ "$hasMore" = "true" ] || break
  cursor=$(printf '%s' "$body" | jq -r .nextCursor)
done

# Trashed captures
cursor=""
while :; do
  qs="status=trashed&limit=50"
  [ -n "$cursor" ] && qs="$qs&cursor=$cursor"
  body=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API/api/captures?$qs") || exit 1
  echo "$body"
  hasMore=$(printf '%s' "$body" | jq -r .hasMore)
  [ "$hasMore" = "true" ] || break
  cursor=$(printf '%s' "$body" | jq -r .nextCursor)
done

# Project timeline
cursor=""
while :; do
  qs="limit=50"
  [ -n "$cursor" ] && qs="$qs&cursor=$cursor"
  body=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
    "$API/api/projects/$PROJECT_ID/history?$qs") || exit 1
  echo "$body"
  hasMore=$(printf '%s' "$body" | jq -r .hasMore)
  [ "$hasMore" = "true" ] || break
  cursor=$(printf '%s' "$body" | jq -r .nextCursor)
done

# Task timeline (works after delete)
cursor=""
while :; do
  qs="limit=50"
  [ -n "$cursor" ] && qs="$qs&cursor=$cursor"
  body=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
    "$API/api/tasks/$TASK_ID/history?$qs") || exit 1
  echo "$body"
  hasMore=$(printf '%s' "$body" | jq -r .hasMore)
  [ "$hasMore" = "true" ] || break
  cursor=$(printf '%s' "$body" | jq -r .nextCursor)
done

# Finished tasks on a project
cursor=""
while :; do
  qs="status=finished&limit=50"
  [ -n "$cursor" ] && qs="$qs&cursor=$cursor"
  body=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
    "$API/api/projects/$PROJECT_ID/tasks?$qs") || exit 1
  echo "$body"
  hasMore=$(printf '%s' "$body" | jq -r .hasMore)
  [ "$hasMore" = "true" ] || break
  cursor=$(printf '%s' "$body" | jq -r .nextCursor)
done
```

## Project notes

A project can have any number of notes. People and bots share the same
routes. The list is a working set (`hasMore` / `nextCursor` / `total`, cap
1000), most recently edited first, without bodies. Read one note for the
markdown body and opaque `version`. Soft-deleted notes keep their row
(`deleted_at`) and are hidden from every list and read — a direct GET is
`404`. The note id is the stable key; titles are not turned into filenames.

`POST` creates. `PATCH` requires `expectedVersion` and returns `409
STALE_NOTE` (with `currentVersion`, `updatedAt`, `updatedById`,
`updatedByName`) instead of overwriting. Title is required, trimmed, max
120 characters. Body may be empty, max 50,000 characters. Every successful
write stores `created_at` and `updated_at` and returns both. Every change
writes `NoteCreated` / `NoteUpdated` / `NoteDeleted` on the project
timeline. Same-person, same-note create/update rows within 10 minutes are
combined at read time.

```bash
# Full set (no bodies)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/projects/$PROJECT_ID/notes"

# Create
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Meeting notes","body":"First line"}' \
  "$API/api/projects/$PROJECT_ID/notes"

# Read one (body + version)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/projects/$PROJECT_ID/notes/$NOTE_ID"

# Edit when the version still matches
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body":"Updated","expectedVersion":"1"}' \
  "$API/api/projects/$PROJECT_ID/notes/$NOTE_ID"

# Soft-delete. Later reads return 404.
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -X DELETE \
  "$API/api/projects/$PROJECT_ID/notes/$NOTE_ID"
```

## Notes mirror (Obsidian)

Yoink stays the source of truth. There is no Obsidian backend on Fly.
Libby’s notes-mirror bot pulls a changed-since feed and pushes Justin’s
Obsidian edits through a dedicated import route. Only that bot token
should call import — it is not a general impersonation feature. Justin
adds the bot member from a signed-in web session (#132) and stores the
token on the box, never in the vault or this repo.

`GET /api/notes/changed?since=<ISO>` is org-scoped to the caller’s token
(people and bots). It is a working set (`hasMore` / `nextCursor` /
`total`, cap 1000), oldest change first, stable on `(updated_at, id)` so
two edits at the same instant are not missed. Live notes are
`kind: "upserted"` with body, version, and `projectName`. Deletes are
tombstones `{ kind: "deleted", id, projectId, projectName, createdAt,
deletedAt }`. Soft-deleted notes stay hidden from the normal note list
and GET.

`POST /api/notes/import` creates or updates a note from the mirror.
Updates require `noteId` and `baseVersion` (the version the Obsidian
file was derived from). If Yoink’s version differs, the response is
`409 NOTE_SYNC_CONFLICT` with `currentVersion` plus the current `title`
and `body` — nothing is overwritten or merged. A successful import is
authored as the organization’s person (Justin) and the timeline reads
“Justin edited this note in Obsidian”. Person tokens get
`403 NOTE_IMPORT_REQUIRES_BOT`. Any bot that is not the designated
notes-mirror bot gets `403 NOTE_IMPORT_REQUIRES_MIRROR_BOT`. Normal
PATCH still uses `409 STALE_NOTE`.

The designated bot is one member id per organization, stored on
`organizations.notes_mirror_bot_user_id`. Justin designates it by minting
a bot named `Libby notes-mirror` from a signed-in web session (#132) —
the first such mint is recorded. If that column is empty, the API
resolves the first org agent with that name and stores it, or uses
`NOTES_MIRROR_BOT_USER_ID` when set. Other bots may still read the
changed-since feed; only the designated bot may import.

```bash
# Everything changed since the last successful pull (full set or page)
curl -sS -H "Authorization: Bearer $LIBBY_BOT_TOKEN" \
  "$API/api/notes/changed?since=2026-10-13T18:00:00.000Z"

# Push an Obsidian edit (Libby’s notes-mirror bot only)
curl -sS -H "Authorization: Bearer $LIBBY_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"'"$PROJECT_ID"'","noteId":"'"$NOTE_ID"'","title":"Meeting notes","body":"From Obsidian","baseVersion":"1"}' \
  "$API/api/notes/import"
```

See `tools/notes-mirror/README.md` for the vault layout, conflict
folder, and how Libby runs the script.

A bad cursor (wrong view, wrong arity, or garbage) fails loudly:

```bash
curl -fsS -o /tmp/bad.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/tasks?filter=completed&cursor=not-a-cursor"
# curl: (22) The requested URL returned error: 400
```

## Who changed a task

Task responses keep `lastChangedBy` and `completedBy` as user ids (UUIDs), or
`null`. They do not include display names. Resolve a name with the organization
members list. Session, a person's API token, and an agent token all work.
A person's own token is a `user` actor; only agent tokens are `bot`.

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/organizations/$ORGANIZATION_ID/members"
```

`$ORGANIZATION_ID` is the current org on `GET /api/auth/session`
(`.organizationId`) if the bot does not already have it.

Response:

```json
{
  "members": [
    {
      "userId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "email": "justin@example.com",
      "kind": "human",
      "role": "owner",
      "joinedAt": "2026-01-15T10:00:00.000Z"
    },
    {
      "userId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "email": "agent-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb@yoink.invalid",
      "name": "Lane",
      "kind": "agent",
      "role": "member",
      "joinedAt": "2026-01-15T10:00:00.000Z"
    }
  ]
}
```

Match the id to `userId`. Agents use `name`; humans use `email`.

## Hand over ownership

The current owner hands the workspace to another person already in it.
Caller and previous owner come from the session, never the body. One save:
the new person becomes owner and the old owner becomes an admin. Bots,
personal workspaces, and non-owners are refused.

```bash
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":"'"$NEXT_OWNER_ID"'"}' \
  "$API/api/organizations/$ORGANIZATION_ID/owner/transfer"
```

`200` body is `{ "owner": Member, "previousOwner": Member }`.

| Code | When |
| --- | --- |
| `BOT_CANNOT_TRANSFER_OWNERSHIP` | An agent token called transfer (`403`) |
| `NOT_CURRENT_OWNER` | Caller is not the current owner (`403`) |
| `PERSONAL_WORKSPACE_TRANSFER` | Personal workspace (`400`) |
| `ALREADY_OWNER` | Target is the caller (`400`) |
| `USER_NOT_FOUND` | Target user does not exist (`404`) |
| `BOT_CANNOT_HAVE_PRIVILEGED_ROLE` | Target is a bot (`400`) |
| `TARGET_NOT_WORKSPACE_MEMBER` | Target is not already a member (`400`) |
| `OWNER_MUST_TRANSFER` | Leave/remove while still owner (`409`, includes `handoverPath`) |

Leave and remove-owner `409`s use message `Hand over ownership first.` and
`handoverPath` `/settings#ownership`. Storage failure is `500`
`Couldn't hand over ownership. Try again.`

```bash
# lastChangedBy on one task → display name
id=$(printf '%s' "$task" | jq -r .lastChangedBy)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/organizations/$ORGANIZATION_ID/members" \
| jq -r --arg id "$id" '
  .members[] | select(.userId == $id)
  | if .kind == "agent" then (.name // "Agent") else .email end
'
```

## Error codes

Project, task, work list, and `POST /api/captures/:id/process-to-project`
return `{ "message": "…", "code": "…" }`. `code` is stable; `message` is for
humans. On those routes, request validation uses a specific code instead of
the generic `[ts-rest] request validation failed` text. Those
`VALIDATION_FAILED` bodies name the failing fields in `message` and `fields`.

`PROJECT_HAS_OPEN_TASKS` and `OPEN_TASKS_UNREAD` also include
`openTaskCount`.

| Code | When |
| --- | --- |
| `PROJECT_NAME_BLANK` | Create/update name is blank after trim (`400`) |
| `INVALID_PROJECT_NAME` | Name is too long (`400`) |
| `DUPLICATE_PROJECT_NAME` | Another project in the org already has that name (`409`) |
| `PROJECT_CREATE_REQUIRES_PERSON` | A bot tried to create an active/someday project, or called `POST /api/captures/:id/process-to-project` (`403`) |
| `PROJECT_PROPOSE_REQUIRES_BOT` | A person sent `status: "proposed"` on create (`403`) |
| `PROJECT_CONFIRM_REQUIRES_PERSON` | A bot called confirm (`403`) |
| `PROJECT_DECLINE_REQUIRES_PERSON` | A bot called decline (`403`) |
| `PROJECT_RESTORE_REQUIRES_PERSON` | A bot called restore (`403`) |
| `PROJECT_NOT_PROPOSED` | Confirm or decline on a project that is not proposed (`409`) |
| `PROJECT_NOT_DECLINED` | Restore on a project that is not declined (`400`) |
| `INVALID_PROJECT_REASON` | Reason is longer than 200 characters (`400`) |
| `INVALID_SUGGESTED_NEXT_ACTION` | Suggested next action is longer than 500 characters (`400`) |
| `CAPTURE_NOT_IN_INBOX` | Process-to-project when the capture is not in the inbox; nothing is written (`409`) |
| `PROJECT_NOT_FOUND` | No project with that id in this org (`404`) |
| `INVALID_PROJECT_STATUS` | Status is not a known project status, including a bad `?status=` list filter; imported projects also refuse `done` and `proposed` (`400`) |
| `PROJECT_WAITING_ON_REQUIRED` | Status is waiting and `waitingOn` was omitted, including on import (`400`) |
| `PROJECT_WAITING_ON_BLANK` | Status is waiting and `waitingOn` is blank after trim (`400`) |
| `PROJECT_WAITING_ON_TOO_LONG` | `waitingOn` is longer than 200 characters (`400`) |
| `INVALID_WAITING_SINCE` | `waitingSince` is not `YYYY-MM-DD` or null (`400`) |
| `PROJECT_DONE_REQUIRES_PERSON` | A bot tried to mark a project done (`403`) |
| `PROJECT_REOPEN_REQUIRES_PERSON` | A bot tried to reopen a done project (`403`) |
| `PROJECT_HAS_OPEN_TASKS` | Marking done with open tasks and no `openTasks` choice (`409`) |
| `OPEN_TASKS_UNREAD` | Marking done could not load every open task (`409`) |
| `invalid_cursor` | Project list cursor is malformed, wrong view, or wrong shape (`400`) |
| `TASK_NOT_OPEN` | Next action is a finished task (`400`) |
| `TASK_NOT_IN_PROJECT` | Next-action task is not in this project (`400`) |
| `TASK_NOT_FOUND` | Next-action task is missing, deleted, or in another org (`404`) |
| `PROJECT_DONE` | Setting a next action on a done project (`400`) |
| `TASK_TITLE_BLANK` | New-task title is blank after trim, including import `newTasks` (`400`) |
| `TASK_TITLE_TOO_LONG` | New-task title is longer than 500 characters, including import `newTasks` (`400`) |
| `INVALID_TASK_DUE_DATE` | Import `newTasks.dueDate` is not a real `YYYY-MM-DD` (`400`) |
| `PROJECT_OBJECTIVE_TOO_LONG` | Import objective is longer than 2000 characters (`400`) |
| `IMPORT_NEW_TASK_KEY_DUPLICATE` | Two `newTasks` in one entry share the same `key` (`400`) |
| `IMPORT_TOO_MANY_TASKS` | The batch attaches or creates more than 200 tasks (`400`) |
| `IMPORT_DUPLICATE_NAME_IN_BATCH` | Two entries in the same batch share a name (`400`) |
| `LIST_NOT_IN_ORGANIZATION` | New-task `listId` is unknown or in another org (`400`) |
| `ASSIGNEE_NOT_IN_ORGANIZATION` | New-task `assigneeId` is not a member of this org (`400`) |
| `INVALID_TIME_ZONE` | bad timeZone on /api/tasks and /api/work/due (`400`) |
| `INVALID_WEEK` | `week` on `/api/review/done` is not a Monday or is after the current week (`400`) |
| `VALIDATION_FAILED` | Other project request-body validation, and task and work list query validation (`400`). `message` and `fields` name the failing fields. |
| `IMPORT_INVALID` | Staging or apply failed all-or-nothing checks; body includes `errors` (`400`) |
| `IMPORT_REQUIRES_PERSON` | A bot tried to apply or discard (`403`) |
| `IMPORT_NOT_FOUND` | No staged import with that id in this org (`404`) |
| `IMPORT_NOT_PENDING` | Apply or discard on an already applied or discarded import (`409`) |
| `INVALID_NOTEBOOK_PATH` | A notebook path is blank, absolute, has `..`, has a scheme, or is not `.md` (`400`) |
| `NOTEBOOK_PAGE_DUPLICATE` | The same notebook path is listed twice on one project (`400`) |
| `NOTEBOOK_PAGES_TOO_MANY` | More than 20 notebook pages (`400`) |
| `TASK_LISTED_TWICE` | The same existing task is listed more than once in the import (`400`) |
| `TASK_ALREADY_IN_PROJECT` | An existing task already belongs to a project (`400`) |
| `NEXT_ACTION_NOT_IN_ENTRY` | `nextAction` is not one of that entry's tasks (`400`) |
| `IMPORT_WAITING_FIELDS_NOT_ALLOWED` | `waitingOn` / `waitingSince` sent when status is not waiting (`400`) |
| `NOTE_TITLE_BLANK` | Note title is blank after trim (`400`) |
| `NOTE_TITLE_TOO_LONG` | Note title is longer than 120 characters (`400`) |
| `NOTE_BODY_TOO_LONG` | Note body is longer than 50,000 characters (`400`) |
| `NOTE_UNCHANGED` | PATCH sent the current title and body (`400`) |
| `STALE_NOTE` | `expectedVersion` no longer matches; body includes `currentVersion` (`409`) |
| `NOTE_SYNC_CONFLICT` | Obsidian import `baseVersion` no longer matches; body includes `currentVersion` plus current title and body (`409`) |
| `NOTE_IMPORT_REQUIRES_BOT` | A person token called `POST /api/notes/import` (`403`) |
| `NOTE_IMPORT_REQUIRES_MIRROR_BOT` | A bot token that is not the designated notes-mirror bot called `POST /api/notes/import` (`403`) |
| `NOTE_SYNC_NO_PERSON` | Import has no human member in the org to attribute the edit to (`403`) |
| `NOTE_NOT_FOUND` | Note is missing, soft-deleted, or in another project/org (`404`) |

