import type { Actor } from '../../shared/auth-context.js';

export type CreateNamedListCommand = {
  name: string;
  organizationId: string;
  createdById: string;
  actor: Actor;
};

export type DeleteNamedListCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

export type RenameNamedListCommand = {
  id: string;
  organizationId: string;
  name: string;
  actor: Actor;
};

export type ReorderOpenTasksCommand = {
  /** Named list id, or null for the unlisted open pile. */
  listId: string | null;
  organizationId: string;
  taskIds: string[];
  actor: Actor;
};
