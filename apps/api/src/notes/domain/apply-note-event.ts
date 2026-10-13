import type { Note, NoteListItem } from '@yoink/api-contracts';
import type { NoteCreated, NoteUpdated } from './events.js';
import { noteExcerpt } from './parse-note-fields.js';

export type ApplyNoteMeta = {
  actorUserId: string;
  actorName: string;
};

export const applyNoteCreated = (event: NoteCreated, meta: ApplyNoteMeta): Note => ({
  id: event.id,
  organizationId: event.organizationId,
  projectId: event.projectId,
  title: event.title,
  body: event.body,
  version: event.version,
  createdAt: event.createdAt,
  createdById: event.createdById,
  createdByName: meta.actorName,
  updatedAt: event.occurredAt,
  updatedById: meta.actorUserId,
  updatedByName: meta.actorName,
});

export const applyNoteUpdated = (
  current: Note,
  event: NoteUpdated,
  meta: ApplyNoteMeta
): Note => ({
  ...current,
  title: event.titleChanged ? event.title : current.title,
  body: event.body ?? current.body,
  version: event.version,
  updatedAt: event.occurredAt,
  updatedById: meta.actorUserId,
  updatedByName: meta.actorName,
});

export const toNoteListItem = (note: Note): NoteListItem => ({
  id: note.id,
  organizationId: note.organizationId,
  projectId: note.projectId,
  title: note.title,
  excerpt: noteExcerpt(note.body),
  version: note.version,
  createdAt: note.createdAt,
  createdById: note.createdById,
  createdByName: note.createdByName,
  updatedAt: note.updatedAt,
  updatedById: note.updatedById,
  updatedByName: note.updatedByName,
});
