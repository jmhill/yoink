import type { InvalidCursorError } from '../../listing/domain/invalid-cursor.js';

export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type NoteTitleBlankError = {
  readonly type: 'NOTE_TITLE_BLANK';
  readonly message: string;
};

export type NoteTitleTooLongError = {
  readonly type: 'NOTE_TITLE_TOO_LONG';
  readonly message: string;
};

export type NoteBodyTooLongError = {
  readonly type: 'NOTE_BODY_TOO_LONG';
  readonly message: string;
};

export type NoteNotFoundError = {
  readonly type: 'NOTE_NOT_FOUND';
  readonly id: string;
  readonly message: string;
};

export type ProjectNotFoundError = {
  readonly type: 'PROJECT_NOT_FOUND';
  readonly id: string;
  readonly message: string;
};

export type StaleNoteError = {
  readonly type: 'STALE_NOTE';
  readonly message: string;
  readonly currentVersion: string;
  readonly updatedAt: string;
  readonly updatedById: string;
  readonly updatedByName: string;
};

export type NoteUnchangedError = {
  readonly type: 'NOTE_UNCHANGED';
  readonly message: string;
};

export type NoteSyncConflictError = {
  readonly type: 'NOTE_SYNC_CONFLICT';
  readonly message: string;
  readonly currentVersion: string;
  readonly title: string;
  readonly body: string;
  readonly updatedAt: string;
  readonly updatedById: string;
  readonly updatedByName: string;
};

export type NoteImportRequiresBotError = {
  readonly type: 'NOTE_IMPORT_REQUIRES_BOT';
  readonly message: string;
};

export type NoteImportRequiresMirrorBotError = {
  readonly type: 'NOTE_IMPORT_REQUIRES_MIRROR_BOT';
  readonly message: string;
};

export type NoteSyncNoPersonError = {
  readonly type: 'NOTE_SYNC_NO_PERSON';
  readonly message: string;
};

export type NoteMarkdownError = {
  readonly type: 'NOTE_MARKDOWN_INVALID';
  readonly message: string;
};

export type ListNotesChangedError = StorageError | InvalidCursorError;

export type ImportNoteError =
  | StorageError
  | NoteTitleBlankError
  | NoteTitleTooLongError
  | NoteBodyTooLongError
  | NoteNotFoundError
  | ProjectNotFoundError
  | NoteSyncConflictError
  | NoteImportRequiresBotError
  | NoteImportRequiresMirrorBotError
  | NoteSyncNoPersonError;

export type ListNotesError = StorageError | InvalidCursorError | ProjectNotFoundError;
export type GetNoteError = StorageError | NoteNotFoundError | ProjectNotFoundError;
export type CreateNoteError =
  | StorageError
  | NoteTitleBlankError
  | NoteTitleTooLongError
  | NoteBodyTooLongError
  | ProjectNotFoundError;
export type UpdateNoteError =
  | StorageError
  | NoteTitleBlankError
  | NoteTitleTooLongError
  | NoteBodyTooLongError
  | NoteNotFoundError
  | ProjectNotFoundError
  | StaleNoteError
  | NoteUnchangedError;
export type DeleteNoteError =
  | StorageError
  | NoteNotFoundError
  | ProjectNotFoundError;

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export const noteTitleBlankError = (): NoteTitleBlankError => ({
  type: 'NOTE_TITLE_BLANK',
  message: "Title can't be blank",
});

export const noteTitleTooLongError = (): NoteTitleTooLongError => ({
  type: 'NOTE_TITLE_TOO_LONG',
  message: 'Title must be 120 characters or fewer',
});

export const noteBodyTooLongError = (): NoteBodyTooLongError => ({
  type: 'NOTE_BODY_TOO_LONG',
  message: 'Body must be 50,000 characters or fewer',
});

export const noteNotFoundError = (id: string): NoteNotFoundError => ({
  type: 'NOTE_NOT_FOUND',
  id,
  message: 'Note not found',
});

export const projectNotFoundError = (id: string): ProjectNotFoundError => ({
  type: 'PROJECT_NOT_FOUND',
  id,
  message: 'Project not found',
});

export const staleNoteError = (current: {
  version: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
}): StaleNoteError => ({
  type: 'STALE_NOTE',
  message: 'This note changed since you opened it',
  currentVersion: current.version,
  updatedAt: current.updatedAt,
  updatedById: current.updatedById,
  updatedByName: current.updatedByName,
});

export const noteUnchangedError = (): NoteUnchangedError => ({
  type: 'NOTE_UNCHANGED',
  message: 'Provide a title or body',
});

export const noteSyncConflictError = (current: {
  version: string;
  title: string;
  body: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
}): NoteSyncConflictError => ({
  type: 'NOTE_SYNC_CONFLICT',
  message: 'This note changed in Yoink since the Obsidian file was last synced',
  currentVersion: current.version,
  title: current.title,
  body: current.body,
  updatedAt: current.updatedAt,
  updatedById: current.updatedById,
  updatedByName: current.updatedByName,
});

export const noteImportRequiresBotError = (): NoteImportRequiresBotError => ({
  type: 'NOTE_IMPORT_REQUIRES_BOT',
  message: 'Only the notes-mirror bot token may import Obsidian edits',
});

export const noteImportRequiresMirrorBotError = (): NoteImportRequiresMirrorBotError => ({
  type: 'NOTE_IMPORT_REQUIRES_MIRROR_BOT',
  message: 'Only the designated notes-mirror bot may import Obsidian edits',
});

export const noteSyncNoPersonError = (): NoteSyncNoPersonError => ({
  type: 'NOTE_SYNC_NO_PERSON',
  message: 'This organization has no person to attribute an Obsidian edit to',
});

export const noteMarkdownError = (message: string): NoteMarkdownError => ({
  type: 'NOTE_MARKDOWN_INVALID',
  message,
});
