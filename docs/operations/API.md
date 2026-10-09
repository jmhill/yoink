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

Cursors are opaque keysets (sort position plus id). Resume with the previous
page’s `nextCursor`. A malformed cursor is `400` with `code: "invalid_cursor"`
— never an empty page that looks done. Completing, uncompleting, trashing, or
deleting the cursor item between requests still returns the remaining rows.

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

## History: loop until `hasMore` is exactly `true`

Completed tasks and trashed captures are open-ended. Page with `nextCursor`.
Break unless `hasMore` is exactly `true` — do not treat a missing field, a
string, or an empty page as done.

```bash
# Done / completed history
cursor=""
while :; do
  qs="filter=completed&limit=50"
  [ -n "$cursor" ] && qs="$qs&cursor=$cursor"
  body=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/api/tasks?$qs")
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
  body=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/api/captures?$qs")
  echo "$body"
  hasMore=$(printf '%s' "$body" | jq -r .hasMore)
  [ "$hasMore" = "true" ] || break
  cursor=$(printf '%s' "$body" | jq -r .nextCursor)
done
```

A bad cursor:

```bash
curl -sS -o /tmp/bad.json -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/tasks?filter=completed&cursor=not-a-cursor"
# 400
# {"message":"Cursor is invalid","code":"invalid_cursor"}
```
