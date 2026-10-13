import { err, ok, type Result } from 'neverthrow';
import { NOTE_BODY_MAX_LENGTH, NOTE_COPY_SUFFIX, NOTE_TITLE_MAX_LENGTH } from '@yoink/api-contracts';
import {
  noteBodyTooLongError,
  noteTitleBlankError,
  noteTitleTooLongError,
  type NoteBodyTooLongError,
  type NoteTitleBlankError,
  type NoteTitleTooLongError,
} from './note-errors.js';

export type ParseNoteTitleError = NoteTitleBlankError | NoteTitleTooLongError;

export const parseNoteTitle = (
  title: string
): Result<string, ParseNoteTitleError> => {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return err(noteTitleBlankError());
  }
  if (trimmed.length > NOTE_TITLE_MAX_LENGTH) {
    return err(noteTitleTooLongError());
  }
  return ok(trimmed);
};

export const parseNoteBody = (
  body: string | undefined
): Result<string, NoteBodyTooLongError> => {
  const value = body ?? '';
  if (value.length > NOTE_BODY_MAX_LENGTH) {
    return err(noteBodyTooLongError());
  }
  return ok(value);
};

export const noteExcerpt = (body: string): string => {
  const line = body.split(/\r?\n/).find((part) => part.trim().length > 0);
  return line === undefined ? '' : line.trim();
};

export const copyNoteTitle = (title: string): string => {
  const maxBase = NOTE_TITLE_MAX_LENGTH - NOTE_COPY_SUFFIX.length;
  const base = title.length > maxBase ? title.slice(0, maxBase) : title;
  return `${base}${NOTE_COPY_SUFFIX}`;
};

export const INITIAL_NOTE_VERSION = '1';

export const nextBuiltInNoteVersion = (current: string): string => {
  const parsed = Number.parseInt(current, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return INITIAL_NOTE_VERSION;
  }
  return String(parsed + 1);
};
