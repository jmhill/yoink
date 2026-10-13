import type { Note } from '@yoink/api-contracts';
import type { Actor } from '../../shared/auth-context.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import { applyNoteCreated, applyNoteUpdated } from './apply-note-event.js';
import {
  changeLogRecordsFromNoteEvent,
  type NoteChangeLogIds,
} from './change-log-records.js';
import type { NoteCreated, NoteDeleted, NoteUpdated } from './events.js';

export type { NoteChangeLogIds };

type NotePlanBase = {
  actor: Actor;
  actorName: string;
  ids: NoteChangeLogIds;
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
      organizationId: string;
      projectId: string;
      view: Note;
      records: ChangeLogRecord[];
    }
  | {
      action: 'update';
      organizationId: string;
      projectId: string;
      noteId: string;
      expectedVersion: string;
      view: Note;
      records: ChangeLogRecord[];
    }
  | {
      action: 'delete';
      organizationId: string;
      projectId: string;
      noteId: string;
      deletedAt: string;
      updatedById: string;
      view: Note;
      records: ChangeLogRecord[];
    };

const recordsFor = (input: NoteChangePlanInput): ChangeLogRecord[] =>
  changeLogRecordsFromNoteEvent({
    event: input.event,
    actor: input.actor,
    ids: input.ids,
  });

const applyMetaFor = (input: NoteChangePlanInput) => ({
  actorUserId: input.actor.userId,
  actorName: input.actorName,
});

const planExistingNoteChange = (
  input: {
    event: NoteUpdated | NoteDeleted;
    current: Note;
  } & NotePlanBase
): NoteChangePlan => {
  const records = recordsFor(input);
  if (input.event.type === 'NoteDeleted') {
    return {
      action: 'delete',
      organizationId: input.event.organizationId,
      projectId: input.event.projectId,
      noteId: input.event.id,
      deletedAt: input.event.deletedAt,
      updatedById: input.actor.userId,
      view: input.current,
      records,
    };
  }

  return {
    action: 'update',
    organizationId: input.event.organizationId,
    projectId: input.event.projectId,
    noteId: input.event.id,
    expectedVersion: input.current.version,
    view: applyNoteUpdated(input.current, input.event, applyMetaFor(input)),
    records,
  };
};

export const planNoteChange = (input: NoteChangePlanInput): NoteChangePlan => {
  if (input.current === null) {
    return {
      action: 'insert',
      organizationId: input.event.organizationId,
      projectId: input.event.projectId,
      view: applyNoteCreated(input.event, applyMetaFor(input)),
      records: recordsFor(input),
    };
  }

  return planExistingNoteChange(input);
};
