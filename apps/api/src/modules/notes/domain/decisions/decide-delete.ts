import { ok, type Result } from 'neverthrow';
import type { Note } from '../model/note.js';
import type { DeleteNoteCommand } from '../messages/note-commands.js';
import type { NoteDeleted } from '../messages/events.js';

export type DecideDeleteNoteInput = {
  command: DeleteNoteCommand;
  current: Note;
  now: string;
};

export const decideDeleteNote = ({
  command,
  current,
  now,
}: DecideDeleteNoteInput): Result<NoteDeleted, never> =>
  ok({
    type: 'NoteDeleted',
    id: current.id,
    organizationId: command.organizationId,
    projectId: command.projectId,
    title: current.title,
    deletedAt: now,
    occurredAt: now,
  });
