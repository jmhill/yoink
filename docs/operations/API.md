# API

Yoink’s HTTP API is token-authenticated (`Authorization: Bearer <tokenId:secret>`).
List endpoints never omit a page marker: every list response includes `hasMore`
(boolean) and `nextCursor` (`string` or explicit `null` when the page is the
last). They also include `total` (the matching row count).

Working-set reads — a named list’s pile, Unlisted, Today, Upcoming, Mine, the
open-task feed (`filter=all`), Inbox, Snoozed, and named lists — return the
whole pile in **one request**, up to a safety cap of 1000. If that cap is hit,
`hasMore` is `true` and `nextCursor` points at the next page. History
(completed/Done tasks, trashed captures) stays paged (default 50).

Cursors are opaque keysets tagged with the list view (board, completed, pile,
lists, projects, capture feed, snoozed, project/task history, finished project
tasks) plus the sort keys for that view. Resume with
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

## Projects

Projects are a working set: `GET /api/projects` returns the full org set in
one request, up to the 1000-item safety cap, with `hasMore` / `nextCursor` /
`total` like named lists. Read one with `GET /api/projects/:id`. Edit name or
objective with `PATCH /api/projects/:id`. Creating a project needs a person
(session or that person's own token) via the shared `requirePerson` guard.
An agent token gets `403` (`PROJECT_CREATE_REQUIRES_PERSON`).

```bash
# Create (person session or the person's own token)
curl -sS -H "Authorization: Bearer $PERSON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Garden","objective":"Grow tomatoes"}' \
  "$API/api/projects"

# Full set
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/projects"

# Read one
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/projects/$PROJECT_ID"

# Edit name and objective (bots allowed)
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X PATCH \
  -d '{"name":"Backyard","objective":"Plant herbs"}' \
  "$API/api/projects/$PROJECT_ID"
```

Responses include `status` (`active` on create; later `waiting`, `someday`,
or `done`), `waitingOn` / `waitingSince` (both `null` unless status is
waiting), optional `objective`, and `lastChangedAt` / `lastChangedBy`
(user ids; resolve names from members).

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

Project routes return `{ "message": "…", "code": "…" }`. `code` is
stable; `message` is for humans. On those routes, request validation
uses a specific code instead of the generic
`[ts-rest] request validation failed` text. Other routes may still
return `{ "message": "…" }` only, or that generic validation text.

`PROJECT_HAS_OPEN_TASKS` and `OPEN_TASKS_UNREAD` also include
`openTaskCount`.

| Code | When |
| --- | --- |
| `PROJECT_NAME_BLANK` | Create/update name is blank after trim (`400`) |
| `INVALID_PROJECT_NAME` | Name is too long (`400`) |
| `DUPLICATE_PROJECT_NAME` | Another project in the org already has that name (`409`) |
| `PROJECT_CREATE_REQUIRES_PERSON` | A bot tried to create a project (`403`) |
| `PROJECT_NOT_FOUND` | No project with that id in this org (`404`) |
| `INVALID_PROJECT_STATUS` | Status is not `active`, `waiting`, `someday`, or `done` (`400`) |
| `PROJECT_WAITING_ON_REQUIRED` | Status is waiting and `waitingOn` was omitted (`400`) |
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
| `TASK_TITLE_BLANK` | New-task title is blank after trim (`400`) |
| `TASK_TITLE_TOO_LONG` | New-task title is longer than 500 characters (`400`) |
| `LIST_NOT_IN_ORGANIZATION` | New-task `listId` is unknown or in another org (`400`) |
| `ASSIGNEE_NOT_IN_ORGANIZATION` | New-task `assigneeId` is not a member of this org (`400`) |
| `VALIDATION_FAILED` | Other project request-body validation (`400`) |

