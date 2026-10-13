import type { Note, NoteListItem, Project } from '@yoink/api-contracts';
import type { ResultAsync } from 'neverthrow';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { NoteChangePlan } from '../domain/plan-note-change.js';
import type { StaleNoteError, StorageError } from '../domain/note-errors.js';

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

export type PersistNoteChange = (
  plan: NoteChangePlan
) => ResultAsync<void, StorageError | StaleNoteError>;

export type NextNoteVersion = (current: string) => string;

/**
 * Persistence/query port for project notes. Story 17 swaps the adapter;
 * versions stay opaque strings and no SQL or row shapes leak past here.
 */
export type NotesBackend = {
  list: PageNotes;
  get: LoadNote;
  persist: PersistNoteChange;
  nextVersion: NextNoteVersion;
};

export type LoadProject = (id: string) => ResultAsync<Project | null, StorageError>;

export type LoadActorName = (userId: string) => ResultAsync<string, StorageError>;
