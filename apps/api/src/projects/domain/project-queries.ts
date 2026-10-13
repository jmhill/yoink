import type { Actor } from '../../shared/auth-context.js';
import type { ProjectStatus } from '@yoink/api-contracts';

export type ListProjectsQuery = {
  organizationId: string;
  limit?: number;
  cursor?: string;
  status?: string;
  createdById?: string;
  actor: Actor;
};

export type { ProjectStatus };

export type GetProjectQuery = {
  id: string;
  organizationId: string;
};

export type ListOpenTasksOnProjectQuery = {
  projectId: string;
  organizationId: string;
  limit?: number;
  cursor?: string;
};
