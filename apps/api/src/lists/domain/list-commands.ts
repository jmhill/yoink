import type { Actor } from '../../shared/actor.js';

export type CreateNamedListCommand = {
  name: string;
  organizationId: string;
  createdById: string;
  /** TODO(#132): PR 151 Actor. Routes pass null until that merges. */
  actor: Actor | null;
};

export type DeleteNamedListCommand = {
  id: string;
  organizationId: string;
  /** TODO(#132): PR 151 Actor. Routes pass null until that merges. */
  actor: Actor | null;
};

export type RenameNamedListCommand = {
  id: string;
  organizationId: string;
  name: string;
  /** TODO(#132): PR 151 Actor. Routes pass null until that merges. */
  actor: Actor | null;
};

export type ReorderOpenTasksCommand = {
  /** Named list id, or null for the unlisted open pile. */
  listId: string | null;
  organizationId: string;
  taskIds: string[];
  /** TODO(#132): PR 151 Actor. Routes pass null until that merges. */
  actor: Actor | null;
};
