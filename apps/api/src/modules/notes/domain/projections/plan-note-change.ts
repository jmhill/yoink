import type { Note } from '../model/note.js';
import type { Actor } from '../../../../kernel/auth-context.js';
import { applyNoteCreated, applyNoteUpdated } from './apply-note-event.js';
import type { NoteCreated, NoteDeleted, NoteUpdated } from '../messages/events.js';

type NotePlanBase = {
  actor: Actor;
  actorName: string;
};

export type NoteChangePlanInput =
  | {
      event: NoteCreated;
      current: null;
    } & NotePlanBase
  | {
      event: NoteUpdated | NoteDeleted;
      current: Note;
    } & NotePlanBase;

export type NoteChangePlan =
  | {
      action: 'insert';
      view: Note;
    }
  | {
      action: 'update';
      noteId: string;
      expectedVersion: string;
      view: Note;
    }
  | {
      action: 'delete';
      organizationId: string;
      projectId: string;
      noteId: string;
      deletedAt: string;
      updatedById: string;
      view: Note;
    };

const applyMetaFor = (input: NoteChangePlanInput) => ({
  actorUserId: input.actor.userId,
  actorName: input.actorName,
});

export const planNoteChange = (input: NoteChangePlanInput): NoteChangePlan => {
  if (input.current === null) {
    return {
      action: 'insert',
      view: applyNoteCreated(input.event, applyMetaFor(input)),
    };
  }

  if (input.event.type === 'NoteDeleted') {
    return {
      action: 'delete',
      organizationId: input.event.organizationId,
      projectId: input.event.projectId,
      noteId: input.event.id,
      deletedAt: input.event.deletedAt,
      updatedById: input.actor.userId,
      view: input.current,
    };
  }

  return {
    action: 'update',
    noteId: input.event.id,
    expectedVersion: input.current.version,
    view: applyNoteUpdated(input.current, input.event, applyMetaFor(input)),
  };
};
