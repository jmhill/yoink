**Yoink UI Design Reference**

**Core Concept**
- Three-tier container hierarchy: Inbox → Desktop → Folders
- Desktop is both a container (holds unfiled stuff) and a working view (surfaces time-sensitive tasks from everywhere)

**Desktop Navigation (Pane Model)**
- Horizontal accordion—one pane expanded at a time, others collapse to clickable vertical bars
- Left-to-right flow: Inbox → Desktop → Folder
- Phase 1: Inbox ↔ Desktop only
- Phase 2: Add folder list as right-side drawer on Desktop view

**Desktop/Folder Layout**
- Two-column split: Tasks (left) | Notes (right)
- Shared component for both Desktop and Folder views

**Desktop Task Filtering**
- Today/Upcoming: Aggregated across Desktop + all Folders (anything with a due date in range)
- All: Desktop-only unfiled tasks (no aggregation)
- Tasks from folders display source tag (e.g., [Projects])

**Desktop Notes**
- Unfiled notes only—no aggregation

**Folder Views**
- Scoped to that folder's tasks and notes only
- No filtering tabs

**Mobile Approach (Separate Paradigm)**
- Bottom nav: Inbox | Tasks | Browse
- Inbox: Primary capture + triage with "To Desktop" / "To Folder" actions
- Tasks: Cross-container aggregation (Today/Upcoming/All)—same concept as Desktop's task filters
- Browse: Drill-down access to Desktop and Folders, de-emphasized
- Mobile is inbox/task-focused; deep project work happens on desktop

**Architecture Note**
- Shared data layer across platforms; different UI shells subscribe to same queries
- Mobile Tasks view requires cross-container query (`useAllTasks(filter)`)
- No need to preload hidden components—lazy load per viewport, let data cache handle continuity