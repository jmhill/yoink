import type { Actor } from '../../shared/actor.js';
import { UNLISTED_PILE_SUBJECT_ID } from '../../shared/change-log/domain/kinds.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import type { ListEvent } from './events.js';

export type ChangeLogRecordsFromListEventInput = {
  event: ListEvent;
  actor: Actor | null;
  now: string;
  nextId: () => string;
};

const actorFields = (actor: Actor | null) => ({
  actorUserId: actor?.userId ?? null,
  actorKind: actor?.kind ?? null,
});

const envelope = (
  input: ChangeLogRecordsFromListEventInput,
  subjectId: string,
  organizationId: string,
  occurredAt: string
) => ({
  id: input.nextId(),
  organizationId,
  projectId: null as string | null,
  subjectType: 'list' as const,
  subjectId,
  schemaVersion: 1 as const,
  occurredAt,
  ...actorFields(input.actor),
});

export const changeLogRecordsFromListEvent = (
  input: ChangeLogRecordsFromListEventInput
): ChangeLogRecord[] => {
  const { event } = input;

  switch (event.type) {
    case 'NamedListCreated':
      return [
        {
          ...envelope(input, event.id, event.organizationId, event.createdAt),
          kind: 'NamedListCreated',
          hidden: false,
          payload: { name: event.name, createdById: event.createdById },
        },
      ];
    case 'NamedListRenamed':
      return [
        {
          ...envelope(input, event.id, event.organizationId, input.now),
          kind: 'NamedListRenamed',
          hidden: false,
          payload: { name: event.name },
        },
      ];
    case 'NamedListDeleted':
      return [
        {
          ...envelope(input, event.id, event.organizationId, input.now),
          kind: 'NamedListDeleted',
          hidden: false,
          payload: {},
        },
      ];
    case 'OpenTasksReordered':
      return [
        {
          ...envelope(
            input,
            event.listId ?? UNLISTED_PILE_SUBJECT_ID,
            event.organizationId,
            input.now
          ),
          kind: 'OpenTasksReordered',
          hidden: true,
          payload: { listId: event.listId, orders: event.orders },
        },
      ];
  }
};
