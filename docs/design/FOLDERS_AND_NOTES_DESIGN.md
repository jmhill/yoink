# Folders and Notes Design

This document captures design decisions for Phase 9 (Folders + Notes). These decisions were researched based on existing codebase patterns and the product vision.

## Status

**Status:** Approved
**Created:** 2026-01-06
**Last Updated:** 2026-01-06

---

## Design Decisions

### 1. Note Size: Cards-with-Expansion

**Decision:** Notes support both card-style display and long-form content.

**Specification:**
- Card preview shows first 200-500 characters with truncation indicator
- Click/tap to open full markdown editor
- Content limit: 50,000 characters (~8,000 words)
- Title limit: 200 characters (matches capture title)

**Rationale:**
- Preserves spatial canvas metaphor from PRODUCT_VISION.md
- Allows meaningful reference documentation (meeting notes, project specs)
- Consistent with existing capture content limit (10,000 chars) scaled up for document use
- 50K chars handles most reference material without enabling full document management

**Implementation Notes:**
- Zod schema: `content: z.string().max(50000).default('')`
- UI: Card component with `isExpanded` state or separate detail route
- Truncation: Use smart truncation (end at word boundary, add "...")

---

### 2. Folder Nesting: Flat Only

**Decision:** Folders are flat (no hierarchy, no `parent_id`).

**Specification:**
- No nested folders
- Simple dropdown picker for folder selection
- No tree navigation UI

**Rationale:**
- Matches "cabinet drawer" metaphor from PRODUCT_VISION.md ("you don't nest drawers")
- Simpler implementation and UX
- Product vision explicitly says "Probably flat to start" (line 340)
- Can add hierarchy later via expand/migrate/contract if usage demands it

**Expansion Path:**
If nested folders become necessary:
1. Add nullable `parent_id` column to folders table
2. Migrate existing folders (all remain top-level)
3. Update folder picker to tree component
4. Update queries to respect hierarchy

---

### 3. Archive Behavior: Query-Time Filtering

**Decision:** Archived folders hide their contents via query-time filtering. Contents remain associated but excluded from default views.

**Specification:**
- `folders.archived_at` column stores archive timestamp (null = active)
- Tasks and notes do NOT have their own `archived_at` column
- Default queries exclude items in archived folders via JOIN
- `includeArchived=true` query param shows archived folders and their contents
- Unarchive is instant (clear `folders.archived_at`)

**Rationale:**
- Single source of truth (folder owns the archived state)
- Instant archive/unarchive without updating N child rows
- Follows existing pattern of query-time filtering (`deleted_at IS NULL`)
- Matches "cabinet drawer" metaphor (close drawer, everything inside is hidden)

**Query Pattern:**
```sql
-- List tasks, excluding those in archived folders
SELECT t.* FROM tasks t
LEFT JOIN folders f ON t.folder_id = f.id
WHERE t.organization_id = ?
  AND t.deleted_at IS NULL
  AND (t.folder_id IS NULL OR f.archived_at IS NULL)
ORDER BY t.created_at DESC;

-- Include archived
SELECT t.* FROM tasks t
LEFT JOIN folders f ON t.folder_id = f.id
WHERE t.organization_id = ?
  AND t.deleted_at IS NULL
ORDER BY t.created_at DESC;
```

**Today/Upcoming Behavior:**
Tasks in archived folders are excluded from Today/Upcoming aggregations by default. The query joins folders and checks `f.archived_at IS NULL`.

**Desktop Items:**
Desktop items (`folder_id IS NULL`) are never affected by folder archiving. The LEFT JOIN returns NULL for folder columns, and `f.archived_at IS NULL` evaluates to true.

---

## Schema Updates

### Folder Table (Migration 021)

```sql
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id)
);

CREATE INDEX idx_folders_organization ON folders(organization_id);
CREATE INDEX idx_folders_archived ON folders(organization_id, archived_at);
```

### Tasks Table Update (Migration 022)

```sql
-- Add folder_id column
ALTER TABLE tasks ADD COLUMN folder_id TEXT REFERENCES folders(id);
CREATE INDEX idx_tasks_folder ON tasks(folder_id);
```

### Notes Table (Migration 023)

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  folder_id TEXT,
  capture_id TEXT,
  position_x REAL,
  position_y REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id),
  FOREIGN KEY (folder_id) REFERENCES folders(id),
  FOREIGN KEY (capture_id) REFERENCES captures(id)
);

CREATE INDEX idx_notes_organization ON notes(organization_id);
CREATE INDEX idx_notes_folder ON notes(folder_id);
CREATE INDEX idx_notes_deleted ON notes(deleted_at);
```

---

## API Contracts

### Folder Schema

```typescript
// packages/api-contracts/src/schemas/folder.ts
import { z } from 'zod';

export const FolderSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdById: z.string().uuid(),
  name: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});

export const CreateFolderSchema = z.object({
  name: z.string().min(1).max(100),
});

export const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const ListFoldersQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional().default(false),
});

export type Folder = z.infer<typeof FolderSchema>;
export type CreateFolderInput = z.infer<typeof CreateFolderSchema>;
export type UpdateFolderInput = z.infer<typeof UpdateFolderSchema>;
```

### Note Schema

```typescript
// packages/api-contracts/src/schemas/note.ts
import { z } from 'zod';

export const NoteSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdById: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string().max(50000).default(''),
  folderId: z.string().uuid().nullable(),
  captureId: z.string().uuid().nullable(),
  positionX: z.number().nullable(),
  positionY: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(50000).optional().default(''),
  folderId: z.string().uuid().nullable().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

export const UpdateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(50000).optional(),
  folderId: z.string().uuid().nullable().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

export const ListNotesQuerySchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
});

export type Note = z.infer<typeof NoteSchema>;
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;
```

---

## Acceptance Test DSL Extensions

The acceptance test DSL needs these additions:

### Types

```typescript
// packages/acceptance-tests/src/dsl/types.ts

export type Folder = {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  createdAt: string;
  archivedAt: string | null;
};

export type Note = {
  id: string;
  organizationId: string;
  createdById: string;
  title: string;
  content: string;
  folderId: string | null;
  captureId: string | null;
  positionX: number | null;
  positionY: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateFolderInput = {
  name: string;
};

export type CreateNoteInput = {
  title: string;
  content?: string;
  folderId?: string | null;
  positionX?: number;
  positionY?: number;
};

// Update Task type to include folderId
export type Task = {
  // ... existing fields ...
  folderId: string | null;
};

export type CreateTaskInput = {
  // ... existing fields ...
  folderId?: string | null;
};
```

### Actor Operations

```typescript
// CoreActor additions

// Folder operations
createFolder(input: CreateFolderInput): Promise<Folder>;
listFolders(options?: { includeArchived?: boolean }): Promise<Folder[]>;
getFolder(id: string): Promise<Folder>;
updateFolder(id: string, input: UpdateFolderInput): Promise<Folder>;
archiveFolder(id: string): Promise<void>;
unarchiveFolder(id: string): Promise<void>;
deleteFolder(id: string): Promise<void>;

// Note operations
createNote(input: CreateNoteInput): Promise<Note>;
listNotes(options?: { folderId?: string | null; includeArchived?: boolean }): Promise<Note[]>;
getNote(id: string): Promise<Note>;
updateNote(id: string, input: UpdateNoteInput): Promise<Note>;
deleteNote(id: string): Promise<void>;

// Process capture to note
processCaptureToNote(captureId: string, input: { title?: string; folderId?: string | null }): Promise<Note>;
```

---

## UI Components

### Folder Picker

Reusable dropdown component for selecting a folder:

```typescript
type FolderPickerProps = {
  value: string | null;  // null = Desktop
  onChange: (folderId: string | null) => void;
  includeDesktop?: boolean;  // Show "Desktop" option (default: true)
  includeCreateNew?: boolean;  // Show "+ New Folder" option (default: false)
};
```

### Note Card

Card component for spatial canvas:

```typescript
type NoteCardProps = {
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
  onPositionChange?: (x: number, y: number) => void;  // For drag positioning
  isExpanded?: boolean;
};
```

### Note Editor

Full markdown editor for note content:

```typescript
type NoteEditorProps = {
  note: Note;
  onSave: (updates: UpdateNoteInput) => Promise<void>;
  onCancel: () => void;
};
```

---

## Open Questions (Resolved)

These questions from PLAN.md are now answered:

| Question | Answer | Rationale |
|----------|--------|-----------|
| Note size: cards or long-form? | Cards-with-expansion (50K limit) | Preserves spatial metaphor, allows real documentation |
| Folder nesting: flat or hierarchy? | Flat only | Simpler, matches metaphor, can expand later |
| Archive behavior? | Query-time filtering on folder | Single source of truth, instant toggle, no cascade updates |

---

## Implementation Prerequisites

Before implementing Phase 9, complete Phase 8.5 (Architecture Cleanup):

1. **ESLint boundary enforcement** - Ensures new modules follow clean patterns
2. **Module consolidation** - `identity/` and `organizations/` structure established
3. **Service contracts** - AdminService as facade pattern ready to replicate

This prevents adding new entities (folders, notes) on top of existing boundary violations.

---

## References

- [PRODUCT_VISION.md](./PRODUCT_VISION.md) - Core metaphors and entity definitions
- [mockups/README.md](../mockups/README.md) - UI design reference
- [MODULAR_MONOLITH.md](../architecture/MODULAR_MONOLITH.md) - Architecture cleanup prerequisite
