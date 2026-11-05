import { ORPCError } from '@orpc/server';
import { yoinkHttpError, yoinkServerError } from '../../shared/orpc/yoink-http-error.js';
import type {
  CreateNoteError,
  DeleteNoteError,
  GetNoteError,
  ImportNoteError,
  ListNotesChangedError,
  ListNotesError,
  NoteSyncConflictError,
  StaleNoteError,
  UpdateNoteError,
} from '../domain/note-errors.js';

const invalidCursor = (error: { readonly message: string }) =>
  new ORPCError('INVALID_CURSOR', {
    message: error.message,
    cause: error,
  });

const noteHttp = (
  code: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND',
  error: { readonly type: string; readonly message: string }
) =>
  yoinkHttpError({
    code,
    message: error.message,
    bodyCode: error.type,
    cause: error,
  });

const staleNote = (error: StaleNoteError) =>
  new ORPCError('CONFLICT', {
    message: error.message,
    data: {
      code: error.type,
      currentVersion: error.currentVersion,
      updatedAt: error.updatedAt,
      updatedById: error.updatedById,
      updatedByName: error.updatedByName,
    },
    cause: error,
  });

const noteSyncConflict = (error: NoteSyncConflictError) =>
  new ORPCError('CONFLICT', {
    message: error.message,
    data: {
      code: error.type,
      currentVersion: error.currentVersion,
      title: error.title,
      body: error.body,
      updatedAt: error.updatedAt,
      updatedById: error.updatedById,
      updatedByName: error.updatedByName,
    },
    cause: error,
  });

export const mapListNotesError = (error: ListNotesError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'PROJECT_NOT_FOUND':
      return noteHttp('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list notes', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list notes', _never);
    }
  }
};

export const mapGetNoteError = (error: GetNoteError) => {
  switch (error.type) {
    case 'NOTE_NOT_FOUND':
    case 'PROJECT_NOT_FOUND':
      return noteHttp('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to get note', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to get note', _never);
    }
  }
};

export const mapCreateNoteError = (error: CreateNoteError) => {
  switch (error.type) {
    case 'NOTE_TITLE_BLANK':
    case 'NOTE_TITLE_TOO_LONG':
    case 'NOTE_BODY_TOO_LONG':
      return noteHttp('BAD_REQUEST', error);
    case 'PROJECT_NOT_FOUND':
      return noteHttp('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to create note', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to create note', _never);
    }
  }
};

export const mapUpdateNoteError = (error: UpdateNoteError) => {
  switch (error.type) {
    case 'NOTE_TITLE_BLANK':
    case 'NOTE_TITLE_TOO_LONG':
    case 'NOTE_BODY_TOO_LONG':
    case 'NOTE_UNCHANGED':
      return noteHttp('BAD_REQUEST', error);
    case 'NOTE_NOT_FOUND':
    case 'PROJECT_NOT_FOUND':
      return noteHttp('NOT_FOUND', error);
    case 'STALE_NOTE':
      return staleNote(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to update note', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to update note', _never);
    }
  }
};

export const mapListNotesChangedError = (error: ListNotesChangedError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list changed notes', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list changed notes', _never);
    }
  }
};

export const mapImportNoteError = (error: ImportNoteError) => {
  switch (error.type) {
    case 'NOTE_TITLE_BLANK':
    case 'NOTE_TITLE_TOO_LONG':
    case 'NOTE_BODY_TOO_LONG':
      return noteHttp('BAD_REQUEST', error);
    case 'NOTE_IMPORT_REQUIRES_BOT':
    case 'NOTE_IMPORT_REQUIRES_MIRROR_BOT':
    case 'NOTE_SYNC_NO_PERSON':
      return noteHttp('FORBIDDEN', error);
    case 'NOTE_NOT_FOUND':
    case 'PROJECT_NOT_FOUND':
      return noteHttp('NOT_FOUND', error);
    case 'NOTE_SYNC_CONFLICT':
      return noteSyncConflict(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to import note', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to import note', _never);
    }
  }
};

export const mapDeleteNoteError = (error: DeleteNoteError) => {
  switch (error.type) {
    case 'NOTE_NOT_FOUND':
    case 'PROJECT_NOT_FOUND':
      return noteHttp('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to delete note', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to delete note', _never);
    }
  }
};
