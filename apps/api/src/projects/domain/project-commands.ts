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
