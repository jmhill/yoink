# Yoink Product Vision

## Executive Summary

Yoink started as a Google Keep replacement—a way to capture quick notes from multiple sources without being locked into Google's ecosystem. With a stable capture foundation now in place (PWA, browser extension, web app), the question becomes: **what happens to captures after they arrive?**

The answer: Yoink evolves into a lightweight personal productivity system where captures are the entry point, not the destination. Everything starts as a raw capture, then graduates into tasks or notes organized on a desktop or within folders.

## The Core Problem

Most productivity tools force premature classification:

- Share to Todoist → "Which project?" → friction
- Save to Obsidian → "What folder? What tags?" → friction  
- Quick note in Keep → pile of guilt that never gets processed

The insight: **classification should happen during processing, not during capture.**

Capture is "get it out of my head." Processing is "what is this, actually?" These are different cognitive modes and shouldn't be forced together.

## The Vision

Yoink becomes a **capture-first productivity system** with three layers:

1. **Capture**: Zero-friction input from anywhere. No decisions required.
2. **Triage**: Daily processing where captures become tasks, notes, or trash.
3. **Work**: Tasks and notes organized on a desktop or in folders, ready to use.

The value proposition: "Get it out of your head fast, then figure out what it is later."

---

## Core Metaphors

### The Physical Workspace Model

| Metaphor | Digital Equivalent | Function |
|----------|-------------------|----------|
| **Mail slot** | Inbox | Stuff arrives here. You have to deal with it. |
| **Desk surface** | Desktop | Active work surface. Unfiled tasks, scratch notes, things in progress. |
| **Cabinet drawers** | Folders | Pull one out when working on something specific. Contains related tasks and notes. |

The desktop isn't a failure state—it's where active, context-switching work lives. "Call dentist" doesn't need a folder. It needs to get done today and disappear.

### Entity Behavior Model

| Capability | Captures | Tasks | Notes |
|------------|----------|-------|-------|
| Pin | ✗ | ✓ | ✓ (or position) |
| Snooze | ✓ | ✗ | ✗ |
| Folder | ✗ (inbox only) | ✓ (optional) | ✓ (optional) |
| Due date | ✗ | ✓ | ✗ |
| Reorder | ✗ | ✓ (sequential) | ✓ (spatial) |
| Rich content | ✗ | ✗ | ✓ (markdown) |

Key insight: each entity type has different interaction needs. Captures are for triage only—no fussing. Tasks are sequential lists. Notes are spatial/free-form.

### Comparison with Related Tools

| Framework | Core Question | Capture's Role |
|-----------|---------------|----------------|
| GTD (David Allen) | "What's the next action?" | Step 1 of 5 (capture → clarify → organize → reflect → engage) |
| Zettelkasten | "How do ideas connect?" | Raw material for permanent notes |
| PARA (Tiago Forte) | "What project does this serve?" | Feeds into projects, areas, resources, or archive |
| **Yoink** | "What is this, actually?" | Pressure-free space to decide before committing |

### Yoink vs. Tadori (Sister Project)

| Dimension | Yoink | Tadori |
|-----------|-------|--------|
| Core question | "What do I need to do/remember?" | "What did I actually do?" |
| Time orientation | Future (tasks, reminders) | Past (session logs, history) |
| Interaction mode | Quick triage, occasional deep organization | Sustained focus, documentation |
| Primary artifact | Tasks and notes | Session summaries |

These could eventually merge—imagine ending a Tadori work session that generates a note in the relevant Yoink folder. But that's future work.

---

## Data Model

### Simplified Entity Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                           FOLDERS                               │
│   (just folders - call them whatever you want)                  │
├─────────────────────────────────────────────────────────────────┤
│  "Bathroom Remodel"    "Health"    "Boat"    "Team DX"         │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
            ┌─────────────┐     ┌─────────────────────┐
            │    Tasks    │     │        Notes        │
            │  (ordered)  │     │      (spatial)      │
            └─────────────┘     └─────────────────────┘
                    ▲                   ▲
                    │                   │
                    └─────────┬─────────┘
                              │ spawned from
                    ┌─────────────────────┐
                    │      Captures       │
                    │   (unstructured)    │
                    └─────────────────────┘
```

### Entity Definitions

**Capture** (exists today)
- `content`: string (the raw captured text)
- `sourceUrl`: string | null (where it came from)
- `sourceApp`: string | null (which app shared it)
- `createdAt`: timestamp
- `snoozedUntil`: timestamp | null
- `status`: 'inbox' | 'archived'
- `spawnedType`: 'task' | 'note' | null (what it became)
- `spawnedId`: uuid | null (reference to spawned entity)

**Task** (new)
- `id`: uuid
- `title`: string
- `folderId`: uuid | null (null = lives on desktop)
- `captureId`: uuid | null (source capture, if any)
- `dueDate`: date | null
- `completedAt`: timestamp | null
- `pinnedAt`: timestamp | null
- `order`: number (for manual sorting within folder/desktop)
- `createdAt`: timestamp

**Note** (future)
- `id`: uuid
- `title`: string
- `content`: string (markdown)
- `folderId`: uuid | null (null = lives on desktop)
- `captureId`: uuid | null (source capture, if any)
- `position`: { x: number, y: number } | null (for spatial layout)
- `createdAt`: timestamp
- `updatedAt`: timestamp

**Folder** (future)
- `id`: uuid
- `name`: string
- `archivedAt`: timestamp | null
- `createdAt`: timestamp

### Desktop Concept

Tasks and notes without a `folderId` live on the "desktop"—the active work surface. This isn't a failure to organize; it's intentional for:

- Quick tasks that don't belong anywhere ("call dentist")
- Work in progress before you know where it belongs
- Temporary notes and scratch work

---

## User Flows

### Capture Flow (exists today)
```
Phone/Browser/Extension → Yoink Inbox → (sits until processed)
```

### Triage Flow (to be built)
```
┌─────────────────────────────────────────────────────────────────┐
│  Inbox                                                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Check oil on boat before next trip                        │  │
│  │                                                           │  │
│  │  [🗑️ Delete]  [😴 Snooze]  [→ Task]  [→ Note]             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Click "→ Task"
                              ▼
┌─────────────────────────────────────────┐
│  Create Task                            │
├─────────────────────────────────────────┤
│  Title                                  │
│  [Check oil on boat__________________]  │
│                                         │
│  Folder (optional)                      │
│  [Desktop__________________________ ▼]  │
│   ├─ Desktop (no folder)                │
│   ├─ Boat                               │
│   ├─ Health                             │
│   └─ + New Folder                       │
│                                         │
│  Due (optional)                         │
│  [_________________________________]    │
│                                         │
│           [Cancel]  [Create Task]       │
└─────────────────────────────────────────┘
```

### Folder View (future)
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Folders    Bathroom Remodel                             ⚙️   │
├─────────────────────────┬───────────────────────────────────────┤
│                         │                                       │
│  TASKS                  │  NOTES                                │
│  ─────────────────────  │                                       │
│  ⭐ Call contractor     │   ┌─────────┐  ┌──────────────────┐   │
│  □ Get second quote     │   │ Tile    │  │ Contractor       │   │
│  □ Finalize tile choice │   │ options │  │ contact info     │   │
│  □ Schedule start date  │   │         │  │                  │   │
│                         │   └─────────┘  │ Mike: 555-1234   │   │
│  ──────────────────     │                │ Available M-F    │   │
│  Completed (3)     ▼    │   ┌─────────┐  └──────────────────┘   │
│                         │   │ Layout  │                         │
│  [ + Add task ]         │   │ sketch  │     ┌───────────────┐   │
│                         │   │         │     │ Questions to  │   │
│                         │   └─────────┘     │ ask           │   │
│                         │                   └───────────────┘   │
└─────────────────────────┴───────────────────────────────────────┘
```

Mobile adaptation: same content, tabs instead of split view.

---

## Phased Build Plan

### Phase A: Desktop + Tasks Only

**Goal**: Test the capture → task flow with minimal investment.

**New entities**:
- Task (title, dueDate?, completedAt?, pinnedAt?, order)

**New UI**:
- Desktop view showing unfiled tasks
- "→ Task" action on captures in inbox
- Task creation modal (title, optional due date)
- Task list with completion, reordering, pin

**Changes to existing**:
- Remove Pin from captures (Pin belongs on tasks/notes)
- Add `spawnedType` and `spawnedId` to captures
- Archive captures when spawned (or show "→ Task" badge)

**What we learn**:
- Does the capture → triage → task flow work?
- Do you actually process the inbox regularly?
- Is the desktop useful or does everything need folders?

**Estimated scope**: 4-6 weeks of hobby time

### Phase B: Folders + Notes

**Goal**: Add organizational structure and reference material.

**New entities**:
- Folder (name, archivedAt?)
- Note (title, content, folderId?, position?)

**New UI**:
- Folder list / navigation
- Folder view with split layout (tasks left, notes right)
- "→ Note" action on captures
- Spatial note canvas with drag positioning
- Markdown editor for note content
- Task and note assignment to folders

**Changes to existing**:
- Add `folderId` to tasks
- Folder picker in task/note creation

**What we learn**:
- Is spatial layout for notes actually useful?
- How often do things move from desktop to folders?
- What's the right folder granularity?

**Estimated scope**: 4-6 weeks of hobby time

### Phase C: Polish + AI

**Goal**: Refine based on usage, add intelligent features.

**Potential features**:
- AI folder suggestions during triage
- Due date views (Today, Upcoming, Someday)
- Cross-folder task search
- Folder archiving and lifecycle
- Quick capture directly to folder (skip inbox)
- Keyboard shortcuts for power users

**What we learn**:
- Which polish actually matters?
- Is AI suggestion helpful or annoying?

**Estimated scope**: Ongoing refinement

### Phase D: Advanced (Future)

**Ideas to consider later**:
- Tadori-style work session logging
- Note linking / wiki features  
- Calendar integration
- Collaboration / sharing
- Mobile-native apps

---

## Key Decisions Made

### Simplifications

| Original Idea | Decision | Rationale |
|---------------|----------|-----------|
| PARA hierarchy (Project/Area/Resource/Archive) | Just "Folders" | Too fussy. Let folders be whatever they need to be. |
| Route captures to external tools | Keep everything in Yoink | Integrations leak abstraction (Sunsama lesson). Opinionated, cohesive workflow beats stitching tools together. |
| Captures are immutable | Content editable, metadata immutable | Typos happen. But creation timestamp and source URL are permanent. |
| Pin on captures | Remove Pin from captures | Pin belongs on tasks and notes. Captures are for triage, not fussing. |

### Principles

1. **Capture is the beginning, not the product.** The value comes from what happens after capture.

2. **Different entities need different UX.** Captures are inbox items (triage only). Tasks are sequential lists. Notes are spatial canvases. Don't force one paradigm on all.

3. **The desktop is a feature, not a bug.** Unfiled tasks/notes are legitimate. Not everything needs a folder.

4. **Build the smallest thing that tests the hypothesis.** Phase A is just tasks—no folders, no notes. See if it works before building more.

5. **Dogfood aggressively.** Use what you build. The pain points during actual use will reveal what to build next.

---

## Open Questions

1. **Task recurrence**: Do you need repeating tasks? (Probably not in v1—adds complexity)

2. **Note size**: Are notes always small cards, or can they be long-form documents?

3. **Folder nesting**: Flat folders only, or nested hierarchy? (Probably flat to start)

4. **Archive behavior**: When a folder is archived, what happens to its tasks and notes?

5. **Search**: When does search become necessary? (Probably when you have 50+ notes)

6. **Tadori integration**: When/how do work session logs fit into this model?

---

## Success Criteria

### Phase A Success
- [ ] You actually process the inbox daily
- [ ] Tasks on the desktop get done and cleared
- [ ] The capture → task flow feels faster than current Todoist workflow
- [ ] You stop using Todoist inbox as a capture point

### Phase B Success  
- [ ] Folders feel useful, not bureaucratic
- [ ] Spatial notes layout is actually used (not just a list in disguise)
- [ ] You can find things when you need them
- [ ] Reference material lives in Yoink instead of scattered across apps

### Overall Success
- [ ] Captures don't pile up in guilt-inducing inbox
- [ ] You have fewer "where did I put that?" moments
- [ ] The tool feels lighter than Notion/Obsidian, more organized than Keep
- [ ] You'd recommend it to a friend with similar needs

---

## Appendix: Competitive Positioning

If Yoink eventually becomes a product:

**Not competing with**:
- Notion (full workspace, teams, databases)
- Obsidian (knowledge graph, PKM power users)
- Todoist (full-featured task management)
- Things 3 (GTD methodology app)

**Competing with**:
- Google Keep (simple capture, no processing model)
- Apple Notes + Reminders (fragmented, no unified workflow)
- The "I have stuff everywhere" problem

**Positioning**: "Capture anything, process it later, keep it simple."

