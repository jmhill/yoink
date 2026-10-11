import type { Project } from '@yoink/api-contracts';
import type { Actor } from '../../shared/auth-context.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import {
  applyProjectCreated,
  applyProjectNextActionCleared,
  applyProjectNextActionSet,
  applyProjectStatusChanged,
  applyProjectUpdated,
  applyProjectWaitingChanged,
} from './apply-project-event.js';
import {
  changeLogRecordsFromProjectEvent,
  type ProjectChangeLogIds,
} from './change-log-records.js';
import type {
  ProjectCreated,
  ProjectNextActionCleared,
  ProjectNextActionSet,
  ProjectStatusChanged,
  ProjectUpdated,
  ProjectWaitingChanged,
} from './events.js';

export type { ProjectChangeLogIds };

type ProjectPlanBase = {
  actor: Actor;
  ids: ProjectChangeLogIds;
};

export type ProjectChangePlanInput =
  | {
      event: ProjectCreated;
      current: null;
    } & ProjectPlanBase
  | {
      event:
        | ProjectUpdated
        | ProjectStatusChanged
        | ProjectWaitingChanged
        | ProjectNextActionSet
        | ProjectNextActionCleared;
      current: Project;
    } & ProjectPlanBase;

export type ProjectChangePlan =
  | {
      action: 'insert';
      organizationId: string;
      view: Project;
      records: ChangeLogRecord[];
    }
  | {
      action: 'update';
      organizationId: string;
      projectId: string;
      view: Project;
      records: ChangeLogRecord[];
    }
  | {
      action: 'clearNextAction';
      organizationId: string;
      projectId: string;
      previousTaskId: string;
      view: Project;
      records: ChangeLogRecord[];
    };

/**
 * Pure: event + pre-generated ids → next state and typed change-log records.
 * Always returns a plan — create/update project without a null fallback.
 */
export function planProjectChange(
  input: Extract<ProjectChangePlanInput, { event: ProjectCreated }>
): Extract<ProjectChangePlan, { action: 'insert' }>;
export function planProjectChange(
  input: Extract<
    ProjectChangePlanInput,
    {
      event:
        | ProjectUpdated
        | ProjectStatusChanged
        | ProjectWaitingChanged
        | ProjectNextActionSet;
    }
  >
): Extract<ProjectChangePlan, { action: 'update' }>;
export function planProjectChange(
  input: Extract<ProjectChangePlanInput, { event: ProjectNextActionCleared }>
): Extract<ProjectChangePlan, { action: 'clearNextAction' }>;
export function planProjectChange(input: ProjectChangePlanInput): ProjectChangePlan;
export function planProjectChange(input: ProjectChangePlanInput): ProjectChangePlan {
  const records = changeLogRecordsFromProjectEvent({
    event: input.event,
    actor: input.actor,
    ids: input.ids,
  });

  const isCreate = (
    value: ProjectChangePlanInput
  ): value is Extract<ProjectChangePlanInput, { event: ProjectCreated }> =>
    value.event.type === 'ProjectCreated';

  if (isCreate(input)) {
    return {
      action: 'insert',
      organizationId: input.event.organizationId,
      view: applyProjectCreated(input.event, { actorUserId: input.actor.userId }),
      records,
    };
  }

  const applyMeta = { actorUserId: input.actor.userId };
  if (input.event.type === 'ProjectNextActionCleared') {
    return {
      action: 'clearNextAction',
      organizationId: input.event.organizationId,
      projectId: input.event.id,
      previousTaskId: input.event.taskId,
      view: applyProjectNextActionCleared(input.current, input.event, applyMeta),
      records,
    };
  }

  const view =
    input.event.type === 'ProjectUpdated'
      ? applyProjectUpdated(input.current, input.event, applyMeta)
      : input.event.type === 'ProjectStatusChanged'
        ? applyProjectStatusChanged(input.current, input.event, applyMeta)
        : input.event.type === 'ProjectWaitingChanged'
          ? applyProjectWaitingChanged(input.current, input.event, applyMeta)
          : applyProjectNextActionSet(input.current, input.event, applyMeta);

  return {
    action: 'update',
    organizationId: input.event.organizationId,
    projectId: input.event.id,
    view,
    records,
  };
}

export const mergeProjectUpdatePlans = (
  first: Extract<ProjectChangePlan, { action: 'update' }>,
  second: Extract<ProjectChangePlan, { action: 'update' | 'clearNextAction' }>
): Extract<ProjectChangePlan, { action: 'update' }> => ({
  action: 'update',
  organizationId: second.organizationId,
  projectId: second.projectId,
  view: second.view,
  records: [...first.records, ...second.records],
});
