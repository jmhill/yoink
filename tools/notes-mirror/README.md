# Yoink notes mirror

Libby runs this on the shared box. It copies Yoink project notes into a
local Obsidian vault and pushes Justin's Obsidian edits back. Yoink stays
the source of truth. This script never talks to Obsidian Sync and never
writes the live vault unless Libby points `--vault` at it.

## What it does

- Pulls `GET /api/notes/changed?since=…` with Libby's bot token.
- Writes or updates `Yoink notes/<project name>/<YYYY-MM-DD> <short id>.md`.
- Moves a Yoink delete to `archive/` (vault rules forbid deleting notes).
- Pushes Justin's Obsidian edits through `POST /api/notes/import`.
- On conflict (edited in both places): Yoink keeps its copy; the Obsidian
  copy goes to `archive/sync-conflicts/`; Libby logs it for Justin.
- If a file disappears in Obsidian, the mirror flags it and does **not**
  delete the Yoink note.
- Safe to run every 15 minutes. Idempotent.

State lives in `--state`, **outside** the vault (never in `Yoink notes/`,
never in the vault, never in this repo).

## Justin adds Libby's bot member

Adding a bot member requires Justin in a signed-in web session (#132).
The agent that ships this story cannot create that token.

1. Justin signs in to Yoink in the browser.
2. He adds a bot member for Libby (notes-mirror).
3. He saves the raw token on the box, for example
   `/home/box/yoink-notes-mirror.token`, mode `600`.
4. Never put the token in the vault or in git.

Only that bot token should call the import route. It is not a general
impersonation feature. Imports are attributed to the organization's
person (Justin) and show as "Justin edited this note in Obsidian".

## Run

```bash
export YOINK_NOTES_TOKEN_FILE=/home/box/yoink-notes-mirror.token
# or: export YOINK_NOTES_TOKEN='…'

pnpm --filter @yoink/notes-mirror build
node tools/notes-mirror/dist/infrastructure/cli.js \
  --vault /path/to/local/test-or-box-vault \
  --api https://yoink.example \
  --state /home/box/yoink-notes-mirror-state.json
```

Do not point `--vault` at `/home/box/obsidian-vault` from CI or from this
repo's tests. Those use a temp directory only.
