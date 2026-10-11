import type { AssignableProjectStatus, ProjectStatus } from '@yoink/api-contracts';

export type ProjectCreated = {
  type: 'ProjectCreated';
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  objective?: string;
  status: 'active' | 'someday';
  captureId?: string;
  createdAt: string;
  occurredAt: string;
};

export type ProjectUpdated = {
  type: 'ProjectUpdated';
  id: string;
  organizationId: string;
  name?: string;
  objective?: string | null;
  notebookPages?: string[];
  occurredAt: string;
};

export type ProjectStatusChanged = {
  type: 'ProjectStatusChanged';
  id: string;
  organizationId: string;
  from: ProjectStatus;
  to: AssignableProjectStatus;
  waitingOn: string | null;
  waitingSince: string | null;
  occurredAt: string;
};

export type ProjectWaitingChanged = {
  type: 'ProjectWaitingChanged';
  id: string;
  organizationId: string;
  waitingOn: string;
  waitingSince: string | null;
  occurredAt: string;
};

export type ProjectNextActionClearReason =
  | 'cleared'
  | 'completed'
  | 'deleted'
  | 'removedFromProject'
  | 'projectDone';

export type ProjectNextActionSet = {
  type: 'ProjectNextActionSet';
  id: string;
  organizationId: string;
  taskId: string;
  previousTaskId: string | null;
  occurredAt: string;
};

export type ProjectNextActionCleared = {
  type: 'ProjectNextActionCleared';
  id: string;
  organizationId: string;
  taskId: string;
  reason: ProjectNextActionClearReason;
  occurredAt: string;
};

export type ProjectEvent =
  | ProjectCreated
  | ProjectUpdated
  | ProjectStatusChanged
  | ProjectWaitingChanged
  | ProjectNextActionSet
  | ProjectNextActionCleared;
