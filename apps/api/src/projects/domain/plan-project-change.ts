import type { Project } from '@yoink/api-contracts';
import type { Actor } from '../../shared/auth-context.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import { applyProjectCreated, applyProjectUpdated } from './apply-project-event.js';
import {
  changeLogRecordsFromProjectEvent,
  type ProjectChangeLogIds,
} from './change-log-records.js';
import type { ProjectCreated, ProjectUpdated } from './events.js';

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
      event: ProjectUpdated;
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
    };

/**
 * Pure: event + pre-generated ids → next state and typed change-log records.
 * Always returns a plan — create/update project without a null fallback.
 */
export function planProjectChange(
  input: Extract<ProjectChangePlanInput, { event: ProjectCreated }>
): Extract<ProjectChangePlan, { action: 'insert' }>;
export function planProjectChange(
  input: Extract<ProjectChangePlanInput, { event: ProjectUpdated }>
): Extract<ProjectChangePlan, { action: 'update' }>;
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

  return {
    action: 'update',
    organizationId: input.event.organizationId,
    projectId: input.event.id,
    view: applyProjectUpdated(input.current, input.event, {
      actorUserId: input.actor.userId,
    }),
    records,
  };
}
