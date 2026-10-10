import type { ProjectStatus, TaskFilter } from '@yoink/api-contracts';
import type { Actor } from '../../shared/auth-context.js';

/** Loaded project when command.projectId is set or changing. */
export type LoadedProject = {
  id: string;
  organizationId: string;
  status: ProjectStatus;
};

export type CreateTaskCommand = {
  title: string;
  dueDate?: string;
  organizationId: string;
  createdById: string;
  captureId?: string; // Source capture, if created from processing
  assigneeId?: string;
  listId?: string; // optional single list bucket; new tasks are open
  projectId?: string; // optional project; independent of list
  actor: Actor;
};

export type ListTasksQuery = {
  organizationId: string;
  filter?: TaskFilter; // 'today' | 'upcoming' | 'all' | 'completed' | 'mine'
  limit?: number;
  cursor?: string;
  /** Authenticated principal; used when filter is 'mine' */
  callerId?: string;
};

export type FindTaskQuery = {
  id: string;
  organizationId: string;
};

export type UpdateTaskCommand = {
  id: string;
  organizationId: string;
  title?: string;
  dueDate?: string | null; // null to clear
  assigneeId?: string | null; // null to clear
  listId?: string | null; // set, replace, or null to take off; omit to leave unchanged
  projectId?: string | null; // set, replace, or null to clear; omit to leave unchanged
  actor: Actor;
};

export type CompleteTaskCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

export type UncompleteTaskCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

export type PinTaskCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

export type UnpinTaskCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

export type DeleteTaskCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};
