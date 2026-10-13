import type { Actor } from '../../shared/auth-context.js';
import { hiddenFor } from '../../shared/change-log/domain/kinds.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import type {
  NoteCreatedPayloadV1,
  NoteDeletedPayloadV1,
  NoteUpdatedPayloadV1,
} from '../../shared/change-log/domain/payloads.js';
import type { NoteEvent } from './events.js';

export type NoteChangeLogIds = {
  recordId: string;
};

export type ChangeLogRecordsFromNoteEventInput = {
  event: NoteEvent;
  actor: Actor;
  ids: NoteChangeLogIds;
};

const actorFields = (actor: Actor) => ({
  actorUserId: actor.userId,
  actorKind: actor.kind,
});

const envelope = (
  input: ChangeLogRecordsFromNoteEventInput,
  organizationId: string,
  projectId: string,
  noteId: string,
  occurredAt: string
) => ({
  id: input.ids.recordId,
  organizationId,
  projectId,
  subjectType: 'note' as const,
  subjectId: noteId,
  schemaVersion: 1 as const,
  occurredAt,
  ...actorFields(input.actor),
});

export const changeLogRecordsFromNoteEvent = (
  input: ChangeLogRecordsFromNoteEventInput
): ChangeLogRecord[] => {
  const { event } = input;

  switch (event.type) {
    case 'NoteCreated': {
      const payload: NoteCreatedPayloadV1 = { title: event.title };
      return [
        {
          ...envelope(input, event.organizationId, event.projectId, event.id, event.occurredAt),
          kind: 'NoteCreated',
          hidden: hiddenFor('NoteCreated'),
          payload,
        },
      ];
    }
    case 'NoteUpdated': {
      const payload: NoteUpdatedPayloadV1 = {
        title: event.title,
        titleChanged: event.titleChanged,
        bodyChanged: event.bodyChanged,
      };
      return [
        {
          ...envelope(input, event.organizationId, event.projectId, event.id, event.occurredAt),
          kind: 'NoteUpdated',
          hidden: hiddenFor('NoteUpdated'),
          payload,
        },
      ];
    }
    case 'NoteDeleted': {
      const payload: NoteDeletedPayloadV1 = { title: event.title };
      return [
        {
          ...envelope(input, event.organizationId, event.projectId, event.id, event.occurredAt),
          kind: 'NoteDeleted',
          hidden: hiddenFor('NoteDeleted'),
          payload,
        },
      ];
    }
  }
};
