import type { GuardedStatement, SqlParticipant } from '../../../../kernel/unit-of-work.js';
import type { Note } from '@yoink/api-contracts';
import type { NoteChangePlan } from '../../domain/projections/plan-note-change.js';

const isNote = (value: unknown): value is Note =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  'organizationId' in value &&
  'version' in value;

const isPlan = (plan: unknown): plan is NoteChangePlan => {
  if (typeof plan !== 'object' || plan === null || !('action' in plan)) {
    return false;
  }
  const action = plan.action;
  return action === 'insert' || action === 'update' || action === 'delete';
};

const insertNote = (note: Note): GuardedStatement => ({
  verb: 'insert',
  guard: false,
  sql: `
    INSERT INTO project_notes (
      id, organization_id, project_id, title, body, version,
      created_at, created_by, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  args: [
    note.id,
    note.organizationId,
    note.projectId,
    note.title,
    note.body,
    note.version,
    note.createdAt,
    note.createdById,
    note.updatedAt,
    note.updatedById,
  ],
});

const updateNote = (note: Note, expectedVersion: string): GuardedStatement => ({
  verb: 'update',
  guard: true,
  sql: `
    -- guard:stale-note
    UPDATE project_notes
    SET title = ?, body = ?, version = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND organization_id = ? AND project_id = ?
      AND version = ? AND deleted_at IS NULL
  `,
  args: [
    note.title,
    note.body,
    note.version,
    note.updatedAt,
    note.updatedById,
    note.id,
    note.organizationId,
    note.projectId,
    expectedVersion,
  ],
});

const deleteNote = (plan: Extract<NoteChangePlan, { action: 'delete' }>): GuardedStatement => ({
  verb: 'update',
  guard: true,
  sql: `
    -- guard:note-missing
    UPDATE project_notes
    SET deleted_at = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND organization_id = ? AND project_id = ? AND deleted_at IS NULL
  `,
  args: [
    plan.deletedAt,
    plan.deletedAt,
    plan.updatedById,
    plan.noteId,
    plan.organizationId,
    plan.projectId,
  ],
});

const rejected = (): readonly GuardedStatement[] => [
  { verb: 'insert', sql: '', args: [], guard: false },
];

export const compileNotePlan = (plan: unknown): readonly GuardedStatement[] => {
  if (!isPlan(plan)) {
    return rejected();
  }
  if (plan.action === 'insert') {
    return isNote(plan.view) ? [insertNote(plan.view)] : rejected();
  }
  if (plan.action === 'update') {
    return isNote(plan.view) ? [updateNote(plan.view, plan.expectedVersion)] : rejected();
  }
  return [deleteNote(plan)];
};

export const notesSqlParticipant: SqlParticipant<unknown> = {
  owner: 'notes',
  compile: compileNotePlan,
};
