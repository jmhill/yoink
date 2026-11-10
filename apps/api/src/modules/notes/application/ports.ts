import type { Note, NoteListItem } from '@yoink/api-contracts';
import type { ResultAsync } from 'neverthrow';
import type { KeysetCursor } from '../../../kernel/listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../../kernel/listing/domain/listed-page.js';
import type { NoteChangeRow } from '../domain/model/note-change-row.js';
import type { StorageError } from '../domain/messages/note-errors.js';

export type PageNotes = (options: {
  organizationId: string;
  projectId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<NoteListItem>, StorageError>;

export type LoadNote = (input: {
  organizationId: string;
  projectId: string;
  noteId: string;
}) => ResultAsync<Note | null, StorageError>;

export type NextNoteVersion = (current: string) => string;

/**
 * Persistence/query port for project notes. Writes go through the unit of
 * work. Versions stay opaque strings and no SQL or row shapes leak past here.
 */
export type PageNotesChanged = (options: {
  organizationId: string;
  since: string;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<NoteChangeRow>, StorageError>;

export type NotesBackend = {
  list: PageNotes;
  listChangedSince: PageNotesChanged;
  get: LoadNote;
  nextVersion: NextNoteVersion;
};

/** The project fields a note command reads. Task management owns the rest. */
export type ProjectForNote = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
};

export type LoadProject = (id: string) => ResultAsync<ProjectForNote | null, StorageError>;

export type LoadActorName = (userId: string) => ResultAsync<string, StorageError>;

export type NoteActor = {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
};

/** Names and emails for the ids a note page already loaded. */
export type LoadNoteActors = (
  userIds: readonly string[]
) => ResultAsync<readonly NoteActor[], StorageError>;

/** An access-owned lookup for an agent by name. Notes passes the name. */
export type LoadNamedAgent = (input: {
  organizationId: string;
  name: string;
}) => ResultAsync<string | null, StorageError>;

export type OrgPerson = {
  readonly userId: string;
  readonly name: string;
};

export type LoadOrgPerson = (
  organizationId: string
) => ResultAsync<OrgPerson | null, StorageError>;

export type LoadNotesMirrorBot = (
  organizationId: string
) => ResultAsync<string | null, StorageError>;

export type DesignateNotesMirrorBot = (input: {
  organizationId: string;
  userId: string;
  name: string;
}) => ResultAsync<void, StorageError>;
