import type { Actor } from '../../shared/auth-context.js';

export type CreateProjectCommand = {
  name: string;
  objective?: string;
  status?: 'active' | 'someday' | 'proposed';
  reason?: string;
  suggestedNextAction?: string;
  organizationId: string;
  createdById: string;
  actor: Actor;
};

export type UpdateProjectCommand = {
  id: string;
  organizationId: string;
  name?: string;
  objective?: string | null;
  notebookPages?: string[];
  reason?: string | null;
  suggestedNextAction?: string | null;
  actor: Actor;
};

export type ConfirmProposedProjectCommand = {
  id: string;
  organizationId: string;
  name?: string;
  objective?: string | null;
  status?: 'active' | 'someday' | 'waiting';
  waitingOn?: string | null;
  waitingSince?: string | null;
  suggestedNextAction?: string | null;
  actor: Actor;
};

export type DeclineProposedProjectCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

export type RestoreDeclinedProjectCommand = {
  id: string;
  organizationId: string;
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

export type NewNextActionTask = {
  title: string;
  dueDate?: string;
  assigneeId?: string;
  listId?: string;
};

export type SetProjectNextActionCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
} & (
  | { type: 'set'; taskId: string }
  | { type: 'clear' }
  | { type: 'newTask'; newTask: NewNextActionTask }
);
