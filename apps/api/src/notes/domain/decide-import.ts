import { err, ok, type Result } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { ImportNoteFromObsidianCommand } from './note-commands.js';
import type { NoteCreated, NoteUpdated } from './events.js';
import {
  noteNotFoundError,
  noteSyncConflictError,
  type ImportNoteError,
  type NoteBodyTooLongError,
  type NoteNotFoundError,
  type NoteSyncConflictError,
  type NoteTitleBlankError,
  type NoteTitleTooLongError,
} from './note-errors.js';
import { INITIAL_NOTE_VERSION, parseNoteBody, parseNoteTitle } from './parse-note-fields.js';

export type DecideImportNoteInput = {
  command: ImportNoteFromObsidianCommand;
  current: Note | null;
  authorUserId: string;
  nextId: string;
  nextVersion: string;
  now: string;
};

export type DecideImportNoteError =
  | NoteTitleBlankError
  | NoteTitleTooLongError
  | NoteBodyTooLongError
  | NoteNotFoundError
  | NoteSyncConflictError;

export type ImportUnchanged = {
  type: 'unchanged';
  view: Note;
};

export type DecideImportNoteResult = NoteCreated | NoteUpdated | ImportUnchanged;

const parsedFields = (
  command: ImportNoteFromObsidianCommand
): Result<{ title: string; body: string }, NoteTitleBlankError | NoteTitleTooLongError | NoteBodyTooLongError> => {
  const title = parseNoteTitle(command.title);
  if (title.isErr()) {
    return err(title.error);
  }
  const body = parseNoteBody(command.body);
  if (body.isErr()) {
    return err(body.error);
  }
  return ok({ title: title.value, body: body.value });
};

export const decideImportNote = ({
  command,
  current,
  authorUserId,
  nextId,
  nextVersion,
  now,
}: DecideImportNoteInput): Result<DecideImportNoteResult, DecideImportNoteError> => {
  const fields = parsedFields(command);
  if (fields.isErr()) {
    return err(fields.error);
  }

  if (command.noteId !== undefined && current === null) {
    return err(noteNotFoundError(command.noteId));
  }

  if (current === null) {
    return ok({
      type: 'NoteCreated',
      id: nextId,
      organizationId: command.organizationId,
      projectId: command.projectId,
      title: fields.value.title,
      body: fields.value.body,
      version: INITIAL_NOTE_VERSION,
      createdById: authorUserId,
      createdAt: now,
      occurredAt: now,
      origin: 'obsidian',
    });
  }

  if (current.title === fields.value.title && current.body === fields.value.body) {
    return ok({ type: 'unchanged', view: current });
  }

  if (command.baseVersion !== current.version) {
    return err(
      noteSyncConflictError({
        version: current.version,
        title: current.title,
        body: current.body,
        updatedAt: current.updatedAt,
        updatedById: current.updatedById,
        updatedByName: current.updatedByName,
      })
    );
  }

  const titleChanged = fields.value.title !== current.title;
  const bodyChanged = fields.value.body !== current.body;
  return ok({
    type: 'NoteUpdated',
    id: current.id,
    organizationId: current.organizationId,
    projectId: current.projectId,
    title: fields.value.title,
    ...(bodyChanged ? { body: fields.value.body } : {}),
    titleChanged,
    bodyChanged,
    version: nextVersion,
    occurredAt: now,
    origin: 'obsidian',
  });
};

export type { ImportNoteError };
