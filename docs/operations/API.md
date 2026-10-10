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
lists, projects, capture feed, snoozed) plus the sort keys for that view. Resume with
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

Responses include `status` (always `active` on create), optional `objective`,
and `lastChangedAt` / `lastChangedBy` (user ids; resolve names from members).

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
```

## History: loop while `hasMore` is true

Completed tasks and trashed captures are open-ended. Page with `nextCursor`.
Keep going only while `hasMore` is exactly `true` — do not treat a missing
field, a string, or an empty page as done. `curl -f` exits on `4xx`/`5xx`,
including `400 invalid_cursor` (malformed cursor, wrong view, or wrong shape).

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
