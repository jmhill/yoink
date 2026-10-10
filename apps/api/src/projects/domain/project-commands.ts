import type { Actor } from '../../shared/auth-context.js';

export type CreateProjectCommand = {
  name: string;
  objective?: string;
  organizationId: string;
  createdById: string;
  actor: Actor;
};

export type UpdateProjectCommand = {
  id: string;
  organizationId: string;
  name?: string;
  objective?: string | null;
  actor: Actor;
};

export type ChangeProjectStatusCommand = {
  id: string;
  organizationId: string;
  status: 'active' | 'waiting' | 'someday' | 'done';
  waitingOn?: string | null;
  waitingSince?: string | null;
  openTasks?: 'complete' | 'remove';
  actor: Actor;
};
