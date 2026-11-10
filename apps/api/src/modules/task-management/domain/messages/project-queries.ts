import type { ProjectStatus } from '../model/project-document.js';
import type { Actor } from '../../../../kernel/auth-context.js';

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
