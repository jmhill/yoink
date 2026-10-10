# Project page (Polly, Sat Oct 10, 2026)

Approved by Justin on Sat Oct 10, 2026.

Issues: #137 (next action). Also covers #136 (status, waiting) and leaves a slot for #138 (history). Replaces today's form-style page in `routes/_authenticated/projects_.$projectId.tsx`.

## Files

- `project-phone.html`: phone (390×844), an active project ("Kitchen renovation") with an objective, a next action, and 3 open tasks.
- `project-desktop.html`: desktop (1280×800), the same project with the left rail.
- `project-phone-waiting.html`: phone (390×844), the same project while waiting on "Contractor" since Sep 30, with no objective and no next action (the incomplete state).
- `project-phone.png`, `project-desktop.png`, `project-phone-waiting.png`: renders of the three files above.
- `src/build.py`: generates the three HTML files from shared CSS and parts. Edit it, then re-run it and re-render.

Each HTML file is self-contained (inline CSS and SVG, no external assets). Elements carry `data-part="…"` names that match the table below.

## What's decided (build to this)

- **No always-on form.** The page is for reading. The name and objective are edited only through **Edit**.
- **Order, top to bottom:**
  1. "All projects" back link.
  2. Header: the name as the heading, a status chip under it, and an Edit button on the right.
  3. Objective.
  4. Waiting line (only when waiting).
  5. Next action card.
  6. Open tasks.
  7. History.
- **Status chip:** active, waiting, someday, or done, in sentence case. Waiting gets the amber (warning) style. The other statuses are neutral.
- **Status control (#136):** changing status is a small control that sits right next to the status chip. It belongs to #136 and is outside the Edit dialog.
- **Edit** opens a dialog with the name and objective. It reuses today's validation, including the blank-name error from #136. Changing status isn't part of this dialog; it's the status control next to the chip (#136).
- **Objective:** plain text under the heading. When it's empty, show a muted "+ Add an objective" link that opens the same Edit dialog.
- **Waiting line (#136):** "Waiting on **{who}** since {Mon D} ({n} days)". When "waiting since" is unknown, show "Waiting on **{who}** · since unknown" with no day count. Shown only when the status is waiting.
- **Next action card (#137):**
  - It's the most prominent block on the page: a strong border and a bigger title.
  - It holds one row, a circle and a title, completable like any row. The meta line shows the due date, plus the owner's name when the owner isn't the viewer (for example a bot like "Lane").
  - "Change" opens the next-action picker.
- **No next action:** a dashed amber card that says "No next action", explains that the project won't show in Work, and has a black "Set next action" button. The project should look unfinished. This applies to every status, waiting included.
- **Set next action / Change** lets you pick one of the project's open tasks or add a new one: "New task" creates the task in this project and makes it the next action.
- **Open tasks:** today's row style (circle, title, small meta line), newest first, with the heading "Open tasks" and the count. Rows have no extra controls (#118). The current next action isn't repeated in this list.
- **History:** a placeholder for #138, drawn as a collapsed row at the bottom. It does nothing until #138 builds it.

## What's NOT decided (placeholders, don't copy)

- **Colors:** hex values approximate the default light theme. The amber "warning" style for waiting and for no next action is **new**, since there's no warning token. Add one token set for light, dark, and tokyo-night rather than hard-coding amber.
- **The History row's contents and expanded state:** these are #138's job. The "placeholder" tag is for the mockup only.
- **Sample content:** the project names, tasks, dates, the placeholder email (you@example.com) in the header, and the pig avatar (drawn as a pink circle) are neutral examples only.
- **Spacing, type sizes, and fonts:** these are approximate. Follow the existing components.
- **The status control's exact form** (for example a menu on the chip) is #136's call, as long as it stays next to the chip and outside Edit.
- **Done and someday pages:** not drawn. They likely hide the "no next action" warning. #136 decides.

## Render the PNGs

From this folder:

```bash
python3 src/build.py
chrome="google-chrome --headless=new --no-sandbox --hide-scrollbars --force-device-scale-factor=2"
$chrome --window-size=390,844  --screenshot=project-phone.png         project-phone.html
$chrome --window-size=390,844  --screenshot=project-phone-waiting.png project-phone-waiting.html
$chrome --window-size=1280,800 --screenshot=project-desktop.png       project-desktop.html
```

## Reuse in the codebase

Files are in `apps/web/src` unless noted. Mapped from the #144 README and a look at `main`'s component list, not a full code read. Items marked **new** have no existing component.

| Part (`data-part`) | Reuse | Notes |
| --- | --- | --- |
| Header bar (avatar, org, gear) | `components/header.tsx` (`Header`) | Unchanged. |
| `back-link` | `Button variant="ghost" asChild` + `Link to="/projects"`, which the page already uses | Moves to the top, with a lucide `ChevronLeft`. |
| `PlaceHeading` (name + chip + Edit) | `components/place-heading.tsx` (`PlaceHeading`) | The name is `title` and Edit goes in the `action` slot. **New:** a slot under the title for the chip. Either add an optional `meta` prop, or pass the chip as the subcopy node (`subcopy` is a `string` today). |
| `status-chip` | **New.** `@yoink/ui-base` has no badge | Make it a small rounded-full span with `bg-muted text-foreground border-border`, and the new warning tokens for waiting. Keep `data-project-status`, which tests already use. |
| `edit-button` and the Edit dialog | `Button variant="outline"`, `@yoink/ui-base/components/dialog` | Model it on `components/create-project-dialog.tsx`, which already has name and objective fields and their errors. Moves today's form, `data-project-name-input` and the other test hooks, into the dialog. |
| `objective`, `objective-empty` | Plain `<p>`; the empty state is a `Button variant="link"` with `text-muted-foreground` | Opens the Edit dialog. |
| `waiting-line` | **New** | The text comes from the #136 fields (waiting on, waiting since). The day count comes from the viewer's local date. |
| `next-action-card` | `@yoink/ui-base/components/card` wrapping the inside of `components/task-card.tsx` (`TaskCard`) | **New:** the highlighted variant, using `border-primary` and a larger title. Owner label from `assigneeLabelFor` / `memberLabel`, shown only when the owner isn't the viewer, as in #144. |
| `next-action-empty` | `Card` + `Button` (default, black) | **New:** the dashed warning style. |
| Next-action picker | `@yoink/ui-base/components/dialog` (desktop) or `drawer` (phone), like `components/promote-sheet.tsx` | **New** component. "New task" reuses the quick-add path with the project preset (#135). |
| Open task rows (`TaskCard`) | `components/task-card.tsx` (PR 162 already renders these rows on the project page; check its wrapper on the merged branch) | Pass `dueDate` and `assigneeLabel`. Leave out `listLabel` and the project (it's this page). |
| `history-placeholder` | **New.** No collapsible exists in ui-base | Leave it as a stub for #138. |
| `AppRailPanel` (desktop rail) | `components/app-rail-panel.tsx`, `lib/app-rail.ts` | Unchanged: Inbox, Task family, Lists, Projects, with the current project highlighted. |
| Phone bottom tabs | `components/bottom-nav.tsx` | Unchanged (Inbox, Tasks) until #141. |
| Colors | `packages/ui-base/src/styles/variables.css` through Tailwind tokens | Don't add hex colors. The warning tokens are the one addition. |
