import { ok, type Result } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { DeleteNoteCommand } from './note-commands.js';
import type { NoteDeleted } from './events.js';

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
