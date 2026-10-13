import { err, ok, type Result } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { UpdateNoteCommand } from './note-commands.js';
import type { NoteUpdated } from './events.js';
import {
  noteUnchangedError,
  staleNoteError,
  type NoteBodyTooLongError,
  type NoteTitleBlankError,
  type NoteTitleTooLongError,
  type NoteUnchangedError,
  type StaleNoteError,
} from './note-errors.js';
import { parseNoteBody, parseNoteTitle } from './parse-note-fields.js';

export type DecideUpdateNoteInput = {
  command: UpdateNoteCommand;
  current: Note;
  nextVersion: string;
  now: string;
};

export type DecideUpdateNoteError =
  | NoteTitleBlankError
  | NoteTitleTooLongError
  | NoteBodyTooLongError
  | StaleNoteError
  | NoteUnchangedError;

export const decideUpdateNote = ({
  command,
  current,
  nextVersion,
  now,
}: DecideUpdateNoteInput): Result<NoteUpdated, DecideUpdateNoteError> => {
  if (command.expectedVersion !== current.version) {
    return err(
      staleNoteError({
        version: current.version,
        updatedAt: current.updatedAt,
        updatedById: current.updatedById,
        updatedByName: current.updatedByName,
      })
    );
  }

  if (command.title === undefined && command.body === undefined) {
    return err(noteUnchangedError());
  }

  if (command.title !== undefined) {
    const parsed = parseNoteTitle(command.title);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    const titleChanged = parsed.value !== current.title;
    if (command.body === undefined) {
      if (!titleChanged) {
        return err(noteUnchangedError());
      }
      return ok({
        type: 'NoteUpdated',
        id: current.id,
        organizationId: current.organizationId,
        projectId: current.projectId,
        title: parsed.value,
        titleChanged: true,
        bodyChanged: false,
        version: nextVersion,
        occurredAt: now,
      });
    }
    const body = parseNoteBody(command.body);
    if (body.isErr()) {
      return err(body.error);
    }
    const bodyChanged = body.value !== current.body;
    if (!titleChanged && !bodyChanged) {
      return err(noteUnchangedError());
    }
    return ok({
      type: 'NoteUpdated',
      id: current.id,
      organizationId: current.organizationId,
      projectId: current.projectId,
      title: parsed.value,
      ...(bodyChanged ? { body: body.value } : {}),
      titleChanged,
      bodyChanged,
      version: nextVersion,
      occurredAt: now,
    });
  }

  const body = parseNoteBody(command.body);
  if (body.isErr()) {
    return err(body.error);
  }
  if (body.value === current.body) {
    return err(noteUnchangedError());
  }
  return ok({
    type: 'NoteUpdated',
    id: current.id,
    organizationId: current.organizationId,
    projectId: current.projectId,
    title: current.title,
    body: body.value,
    titleChanged: false,
    bodyChanged: true,
    version: nextVersion,
    occurredAt: now,
  });
};
