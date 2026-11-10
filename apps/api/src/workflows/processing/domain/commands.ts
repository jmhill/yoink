import type { Actor } from '../../../kernel/auth-context.js';

/** One caller intent: turn an inbox capture into a task. */
export type ProcessCaptureToTaskCommand = {
  id: string;
  organizationId: string;
  createdById: string;
  title?: string;
  dueDate?: string;
  listId?: string;
  projectId?: string;
  actor: Actor;
};

/** One caller intent: turn an inbox capture into a project. */
export type ProcessCaptureToProjectCommand = {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  objective?: string;
  status: 'active' | 'someday';
  actor: Actor;
};
