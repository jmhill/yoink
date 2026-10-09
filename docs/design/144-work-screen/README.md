# Work screen: design B (locked by Justin, Fri Oct 9, 2026)

Issue: #144 (Work screen). Mockups from #140.

## Files

- `src/b.html`: phone (390×844), Work tab, the Now view.
- `src/bs.html`: phone (390×844), the Lists sheet open after tapping the Lists row.
- `src/db.html`: desktop (1440×900), sidebar plus the Now view plus a detail panel.
- `work-b.png`, `work-b-sheet.png`, `work-desktop-b.png`: renders of the three files above. Not committed yet; see "Render the PNGs".

Each HTML file is self-contained (inline CSS and SVG, no external assets). Open it in a browser to inspect the structure.

## What's decided (build to this)

- **Now is the default Work view.** It isn't a list or a filter. Yoink builds it.
- **Now has two sections:**
  - "Next actions": each active project's single next action, with the project name and any due date in small text under the title.
  - "Due": loose tasks (no project) that have a due date.
- **Order within each section:** overdue first, then by due date, then undated.
- **Waiting and someday projects never appear** in Work.
- **The header** shows the date and counts, for example "6 next actions · 1 due".
- **Phone:**
  - Below the sections is a "Lists" row with a count.
  - Tapping it opens a sheet listing the named lists and Unlisted, with open-task counts and "+ New list".
  - Picking a list shows that list's tasks the way they look today.
- **Desktop:**
  - In the sidebar, Work expands into a "Now" item and an indented "Lists" group with the named lists, Unlisted, and their counts, plus "+ New list".
  - Selecting a list shows it in the main pane.
  - The sidebar order is Capture, Process, Work, Review.
- **Rows:** a circle and a title, the same as today's rows (#118). Rows have no other controls.

## What's NOT decided (placeholders, don't copy)

- **Colors:** the mockups' dark palette is an approximation. Use Yoink's existing theme tokens in all three themes.
- **The desktop right-hand detail panel:** its content is a placeholder. Today's task edit behavior stays, unless a later story changes it.
- **Sample content:** the list names, task counts, the "Justin Hill" sidebar footer, and the inbox badge number are sample data.
- **Spacing and type sizes:** pixel values are approximate. Follow the existing components.

## Render the PNGs

The PNGs were rendered at 2× device scale with headless Chrome. From this folder:

```bash
chrome="google-chrome --headless=new --hide-scrollbars --force-device-scale-factor=2"
$chrome --window-size=390,844  --screenshot=work-b.png         src/b.html
$chrome --window-size=390,844  --screenshot=work-b-sheet.png   src/bs.html
$chrome --window-size=1440,900 --screenshot=work-desktop-b.png src/db.html
```

Add `--no-sandbox` if Chrome runs in a container. That gives 780×1688 phone PNGs and a 2880×1800 desktop PNG. A Playwright `page.screenshot()` with the same viewport and `deviceScaleFactor: 2` gives an equivalent render. The command above reproduces Polly's original PNGs byte for byte.

## Reuse in the codebase

What each part of design B maps to today, in `apps/web/src` unless noted. Verified against `main` at 0cd2464. Items marked **new** have no existing component.

| Design B part | Reuse | Notes |
| --- | --- | --- |
| Colors in the mockup | `packages/ui-base/src/styles/variables.css` (imported by `apps/web/src/index.css`) | Use the semantic tokens through Tailwind (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `text-primary`, `bg-primary/10`, `text-destructive`, `bg-sidebar`…). They're defined for default light, `.dark`, and `.theme-tokyo-night` (light and dark). Theme switching lives in `lib/use-theme.ts`. Don't add hex colors. |
| Mockup amber accent (active tab, selected rail item) | `text-primary`, `bg-primary/10 text-primary` | Same active style as `components/app-rail-panel.tsx` (`railClassName`) and `components/bottom-nav.tsx`. |
| Task row (circle + title + small meta) | `components/task-card.tsx` (`TaskCard`) | Already has the 44px complete circle, swipe-right to complete (`components/swipeable-card.tsx`), tap to edit, and a meta line with due date, assignee, and list. **New:** a project-name meta item; it has `listLabel` today, not a project. |
| Due date text, overdue in red | `TaskCard` `formatDueDate` / `getDueDateColorClass` | Overdue is `text-destructive`; today and future use the existing orange/green classes. Mockup colors are placeholders. |
| "Next actions" / "Due" section headings with counts | Section heading pattern in `routes/_authenticated/tasks.tsx` (`TodayTaskList`, `PileGroupList`) and `RAIL_SECTION_HEADING_CLASS` in `components/app-rail-panel.tsx` | **New** component for the two Now sections. Rows render inside `components/animated-list.tsx` (`AnimatedList`, `AnimatedListItem`), as on the Tasks board. |
| Header "Work" + "Fri Oct 9 · 6 next actions · 1 due" | `components/place-heading.tsx` (`PlaceHeading`) with `components/header.tsx` (`Header`) above it | `PlaceHeading` is title plus muted subcopy, with an optional `action` slot. |
| Phone: "Lists" row + Lists sheet | `@yoink/ui-base/components/drawer` (vaul, `direction="bottom"` gives the rounded top and grab handle) or `@yoink/ui-base/components/sheet` (Radix, `side="bottom"`) | `components/mobile-tasks-rail-drawer.tsx` is the existing vaul usage (left drawer, closes on navigation) and `components/promote-sheet.tsx` uses `Sheet`. The "Lists" row itself is **new**. |
| Lists in the sheet/sidebar, Unlisted, "+ New list" | `lib/app-rail.ts` (`buildAppRailItems`, `RAIL_LISTS_HEADING`, `isRailItemActive`) and `components/app-rail-panel.tsx` | Named lists, then Unlisted, then New list, already in that order. "+ New list" opens `components/create-named-list-dialog.tsx`. Rename/delete use `components/named-list-rail-overflow.tsx`, `named-list-rename-field.tsx`, and `delete-named-list-dialog.tsx`. **New:** open-task counts per list (the rail shows no counts today). |
| Picking a list shows its tasks "as today" | `routes/_authenticated/tasks.tsx` with `?pile=<listId>` / `?pile=unlisted` (`namedPileSearch`, `unlistedPileSearch` in `lib/all-tasks-piles.ts`) | `/lists/$listId` and `/lists/unlisted` are thin redirect routes into the same board. |
| Desktop sidebar (Capture, Process, Work › Now + Lists, Review) | `components/bottom-nav.tsx` (`AppNav` mounts `AppRailPanel surface="desktop"` as a fixed `w-48` sidebar) and `routes/_authenticated.tsx` (`md:pl-48`) | The four top-level items and the indented Work group are **new** (the rail today is Inbox, task family, Lists). Desktop vs phone is `lib/use-desktop-layout.ts` (`MD_BREAKPOINT_PX = 768`). |
| Phone bottom tabs (Capture, Process, Work, Review) | `components/bottom-nav.tsx` (`mobileNavItems`, Inbox and Tasks today) | Same `Link` + lucide icon + `text-primary` active style; the four tabs themselves are #141. |
| Desktop detail panel | Placeholder; keep `components/task-edit-modal.tsx` (`TaskEditModal`, a `Dialog`) | Per "What's NOT decided". |
| Cards and buttons | `@yoink/ui-base/components/card`, `button`, `separator` | `TaskCard` already wraps each row in a `Card`; the mockup's single grouped card is approximate spacing. |
| Live freshness | `lib/live-query.ts` | Add the Work query key to `LIVE_QUERY_COLLECTION_KEYS` so it refreshes with the 10s poll (#125). |
