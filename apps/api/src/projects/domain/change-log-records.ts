import type { Actor } from '../../shared/auth-context.js';
import { hiddenFor } from '../../shared/change-log/domain/kinds.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import type {
  ProjectCreatedPayloadV1,
  ProjectNextActionClearedPayloadV1,
  ProjectNextActionSetPayloadV1,
  ProjectStatusChangedPayloadV1,
  ProjectUpdatedPayloadV1,
  ProjectWaitingChangedPayloadV1,
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
      ...(event.objective !== undefined ? { objective: event.objective } : {}),
      ...(event.captureId !== undefined ? { captureId: event.captureId } : {}),
      ...(event.reason !== undefined ? { reason: event.reason } : {}),
      ...(event.suggestedNextAction !== undefined
        ? { suggestedNextAction: event.suggestedNextAction }
        : {}),
    };
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
    if (event.notebookPages !== undefined) {
      payload.notebookPages = event.notebookPages;
    }
    if (event.reason !== undefined) {
      payload.reason = event.reason;
    }
    if (event.suggestedNextAction !== undefined) {
      payload.suggestedNextAction = event.suggestedNextAction;
    }
    return payload;
  },
  ProjectStatusChanged: (
    event: Extract<ProjectEvent, { type: 'ProjectStatusChanged' }>
  ): ProjectStatusChangedPayloadV1 => ({
    from: event.from,
    to: event.to,
    waitingOn: event.waitingOn,
    waitingSince: event.waitingSince,
  }),
  ProjectWaitingChanged: (
    event: Extract<ProjectEvent, { type: 'ProjectWaitingChanged' }>
  ): ProjectWaitingChangedPayloadV1 => ({
    waitingOn: event.waitingOn,
    waitingSince: event.waitingSince,
  }),
  ProjectNextActionSet: (
    event: Extract<ProjectEvent, { type: 'ProjectNextActionSet' }>
  ): ProjectNextActionSetPayloadV1 => ({
    taskId: event.taskId,
    previousTaskId: event.previousTaskId,
  }),
  ProjectNextActionCleared: (
    event: Extract<ProjectEvent, { type: 'ProjectNextActionCleared' }>
  ): ProjectNextActionClearedPayloadV1 => ({
    taskId: event.taskId,
    reason: event.reason,
  }),
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
    case 'ProjectStatusChanged':
      return [
        {
          ...envelope(input, event.organizationId, event.id, event.occurredAt),
          kind: 'ProjectStatusChanged',
          hidden: hiddenFor('ProjectStatusChanged'),
          payload: projectPayloadByType.ProjectStatusChanged(event),
        },
      ];
    case 'ProjectWaitingChanged':
      return [
        {
          ...envelope(input, event.organizationId, event.id, event.occurredAt),
          kind: 'ProjectWaitingChanged',
          hidden: hiddenFor('ProjectWaitingChanged'),
          payload: projectPayloadByType.ProjectWaitingChanged(event),
        },
      ];
    case 'ProjectNextActionSet':
      return [
        {
          ...envelope(input, event.organizationId, event.id, event.occurredAt),
          kind: 'ProjectNextActionSet',
          hidden: hiddenFor('ProjectNextActionSet'),
          payload: projectPayloadByType.ProjectNextActionSet(event),
        },
      ];
    case 'ProjectNextActionCleared':
      return [
        {
          ...envelope(input, event.organizationId, event.id, event.occurredAt),
          kind: 'ProjectNextActionCleared',
          hidden: hiddenFor('ProjectNextActionCleared'),
          payload: projectPayloadByType.ProjectNextActionCleared(event),
        },
      ];
  }
};
