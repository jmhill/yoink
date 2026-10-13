import { err, ok, type Result } from 'neverthrow';
import type { CreateNoteCommand } from './note-commands.js';
import type { NoteCreated } from './events.js';
import {
  type CreateNoteError,
  type NoteBodyTooLongError,
  type NoteTitleBlankError,
  type NoteTitleTooLongError,
} from './note-errors.js';
import { INITIAL_NOTE_VERSION, parseNoteBody, parseNoteTitle } from './parse-note-fields.js';

export type DecideCreateNoteInput = {
  command: CreateNoteCommand;
  id: string;
  now: string;
};

export type DecideCreateNoteError =
  | NoteTitleBlankError
  | NoteTitleTooLongError
  | NoteBodyTooLongError;

export const decideCreateNote = ({
  command,
  id,
  now,
}: DecideCreateNoteInput): Result<NoteCreated, DecideCreateNoteError> => {
  const title = parseNoteTitle(command.title);
  if (title.isErr()) {
    return err(title.error);
  }
  const body = parseNoteBody(command.body);
  if (body.isErr()) {
    return err(body.error);
  }

  return ok({
    type: 'NoteCreated',
    id,
    organizationId: command.organizationId,
    projectId: command.projectId,
    title: title.value,
    body: body.value,
    version: INITIAL_NOTE_VERSION,
    createdById: command.actor.userId,
    createdAt: now,
    occurredAt: now,
  });
};

export type { CreateNoteError };
