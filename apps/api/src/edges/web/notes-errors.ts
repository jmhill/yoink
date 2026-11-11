import { ORPCError } from '@orpc/server';
import { yoinkHttpError, yoinkServerError } from '../_shared/orpc/yoink-http-error.js';
import {
  namedValidationFailedMessage,
  validationIssuePaths,
  type RequestValidationErr,
} from '../_shared/request-validation.js';
import type {
  CreateNoteError,
  DeleteNoteError,
  GetNoteError,
  ListNotesError,
  StaleNoteError,
  UpdateNoteError,
} from '../../modules/notes/index.js';

/**
 * Copied from the public-api note maps so this edge does not import that
 * edge. Statuses and bodies stay the same. Import and changed stay on `/api`.
 */

type NoteHttpError = {
  message: string;
  code: string;
  fields?: string[];
};

type ValidationIssue = {
  path: string;
  code: string;
};

const firstIssue = (err: RequestValidationErr): ValidationIssue | null => {
  const sources = [err.body, err.query, err.pathParams, err.headers];
  for (const source of sources) {
    const issue = source?.issues?.[0];
    if (issue) {
      return {
        path: issue.path.map(String).join('.'),
        code: issue.code,
      };
    }
  }
  return null;
};

/** Same validation bodies as the public note routes. */
export const noteRequestValidationError = (err: RequestValidationErr): NoteHttpError => {
  const issue = firstIssue(err);
  if (!issue) {
    const fields = validationIssuePaths(err);
    return {
      message: namedValidationFailedMessage(fields),
      code: 'VALIDATION_FAILED',
      fields,
    };
  }

  if (issue.path === 'title' && issue.code === 'too_small') {
    return { message: "Title can't be blank", code: 'NOTE_TITLE_BLANK' };
  }
  if (issue.path === 'title' && issue.code === 'too_big') {
    return { message: 'Title must be 120 characters or fewer', code: 'NOTE_TITLE_TOO_LONG' };
  }
  if (issue.path === 'body' && issue.code === 'too_big') {
    return { message: 'Body must be 50,000 characters or fewer', code: 'NOTE_BODY_TOO_LONG' };
  }
  if (issue.path === 'expectedVersion') {
    return { message: 'expectedVersion is required', code: 'VALIDATION_FAILED' };
  }
  if (issue.path === 'baseVersion') {
    return {
      message: 'baseVersion is required when updating an existing note',
      code: 'VALIDATION_FAILED',
    };
  }
  if (issue.path === 'since') {
    return { message: 'since must be an ISO timestamp', code: 'VALIDATION_FAILED' };
  }

  const fields = validationIssuePaths(err);
  return {
    message: namedValidationFailedMessage(fields),
    code: 'VALIDATION_FAILED',
    fields,
  };
};

const invalidCursor = (error: { readonly message: string }) =>
  new ORPCError('INVALID_CURSOR', {
    message: error.message,
    cause: error,
  });

const noteHttp = (
  code: 'BAD_REQUEST' | 'NOT_FOUND',
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
