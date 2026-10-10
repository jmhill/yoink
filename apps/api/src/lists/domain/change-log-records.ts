import type { Actor } from '../../shared/actor.js';
import {
  UNLISTED_PILE_SUBJECT_ID,
  hiddenFor,
} from '../../shared/change-log/domain/kinds.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import type {
  NamedListCreatedPayloadV1,
  NamedListDeletedPayloadV1,
  NamedListRenamedPayloadV1,
  OpenTasksReorderedPayloadV1,
} from '../../shared/change-log/domain/payloads.js';
import type { ListEvent } from './events.js';

export type ListChangeLogIds = {
  recordId: string;
};

export type ChangeLogRecordsFromListEventInput = {
  event: ListEvent;
  actor: Actor | null;
  ids: ListChangeLogIds;
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
  id: input.ids.recordId,
  organizationId,
  projectId: null as string | null,
  subjectType: 'list' as const,
  subjectId,
  schemaVersion: 1 as const,
  occurredAt,
  ...actorFields(input.actor),
});

const listPayloadByType = {
  NamedListCreated: (
    event: Extract<ListEvent, { type: 'NamedListCreated' }>
  ): NamedListCreatedPayloadV1 => ({
    name: event.name,
    createdById: event.createdById,
  }),
  NamedListRenamed: (
    event: Extract<ListEvent, { type: 'NamedListRenamed' }>
  ): NamedListRenamedPayloadV1 => ({
    name: event.name,
  }),
  NamedListDeleted: (
    _event: Extract<ListEvent, { type: 'NamedListDeleted' }>
  ): NamedListDeletedPayloadV1 => ({}),
  OpenTasksReordered: (
    event: Extract<ListEvent, { type: 'OpenTasksReordered' }>
  ): OpenTasksReorderedPayloadV1 => ({
    listId: event.listId,
    orders: event.orders,
  }),
} satisfies {
  [K in ListEvent['type']]: (event: Extract<ListEvent, { type: K }>) => unknown;
};

export const changeLogRecordsFromListEvent = (
  input: ChangeLogRecordsFromListEventInput
): ChangeLogRecord[] => {
  const { event } = input;

  switch (event.type) {
    case 'NamedListCreated':
      return [
        {
          ...envelope(input, event.id, event.organizationId, event.occurredAt),
          kind: 'NamedListCreated',
          hidden: hiddenFor('NamedListCreated'),
          payload: listPayloadByType.NamedListCreated(event),
        },
      ];
    case 'NamedListRenamed':
      return [
        {
          ...envelope(input, event.id, event.organizationId, event.occurredAt),
          kind: 'NamedListRenamed',
          hidden: hiddenFor('NamedListRenamed'),
          payload: listPayloadByType.NamedListRenamed(event),
        },
      ];
    case 'NamedListDeleted':
      return [
        {
          ...envelope(input, event.id, event.organizationId, event.occurredAt),
          kind: 'NamedListDeleted',
          hidden: hiddenFor('NamedListDeleted'),
          payload: listPayloadByType.NamedListDeleted(event),
        },
      ];
    case 'OpenTasksReordered':
      return [
        {
          ...envelope(
            input,
            event.listId ?? UNLISTED_PILE_SUBJECT_ID,
            event.organizationId,
            event.occurredAt
          ),
          kind: 'OpenTasksReordered',
          hidden: hiddenFor('OpenTasksReordered'),
          payload: listPayloadByType.OpenTasksReordered(event),
        },
      ];
  }
};
