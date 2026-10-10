import type { Actor } from '../../shared/auth-context.js';
import { hiddenFor } from '../../shared/change-log/domain/kinds.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import type {
  ProjectCreatedPayloadV1,
  ProjectUpdatedPayloadV1,
} from '../../shared/change-log/domain/payloads.js';
import type { ProjectEvent } from './events.js';

export type ProjectChangeLogIds = {
  recordId: string;
};

export type ChangeLogRecordsFromProjectEventInput = {
  event: ProjectEvent;
  actor: Actor;
  ids: ProjectChangeLogIds;
};

const actorFields = (actor: Actor) => ({
  actorUserId: actor.userId,
  actorKind: actor.kind,
});

const envelope = (
  input: ChangeLogRecordsFromProjectEventInput,
  organizationId: string,
  projectId: string,
  occurredAt: string
) => ({
  id: input.ids.recordId,
  organizationId,
  projectId,
  subjectType: 'project' as const,
  subjectId: projectId,
  schemaVersion: 1 as const,
  occurredAt,
  ...actorFields(input.actor),
});

const projectPayloadByType = {
  ProjectCreated: (
    event: Extract<ProjectEvent, { type: 'ProjectCreated' }>
  ): ProjectCreatedPayloadV1 => {
    const payload: ProjectCreatedPayloadV1 = {
      name: event.name,
      status: event.status,
      createdById: event.createdById,
    };
    if (event.objective !== undefined) {
      payload.objective = event.objective;
    }
    return payload;
  },
  ProjectUpdated: (
    event: Extract<ProjectEvent, { type: 'ProjectUpdated' }>
  ): ProjectUpdatedPayloadV1 => {
    const payload: ProjectUpdatedPayloadV1 = {};
    if (event.name !== undefined) {
      payload.name = event.name;
    }
    if (event.objective !== undefined) {
      payload.objective = event.objective;
    }
    return payload;
  },
} satisfies {
  [K in ProjectEvent['type']]: (event: Extract<ProjectEvent, { type: K }>) => unknown;
};

export const changeLogRecordsFromProjectEvent = (
  input: ChangeLogRecordsFromProjectEventInput
): ChangeLogRecord[] => {
  const { event } = input;

  switch (event.type) {
    case 'ProjectCreated':
      return [
        {
          ...envelope(input, event.organizationId, event.id, event.occurredAt),
          kind: 'ProjectCreated',
          hidden: hiddenFor('ProjectCreated'),
          payload: projectPayloadByType.ProjectCreated(event),
        },
      ];
    case 'ProjectUpdated':
      return [
        {
          ...envelope(input, event.organizationId, event.id, event.occurredAt),
          kind: 'ProjectUpdated',
          hidden: hiddenFor('ProjectUpdated'),
          payload: projectPayloadByType.ProjectUpdated(event),
        },
      ];
  }
};
