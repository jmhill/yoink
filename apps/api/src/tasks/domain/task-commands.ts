import type { TaskFilter } from '@yoink/api-contracts';

export type CreateTaskCommand = {
  title: string;
  dueDate?: string;
  organizationId: string;
  createdById: string;
  captureId?: string; // Source capture, if created from processing
};

export type ListTasksQuery = {
  organizationId: string;
  filter?: TaskFilter; // 'today' | 'upcoming' | 'all' | 'completed'
  limit?: number;
  cursor?: string;
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
};

export type CompleteTaskCommand = {
  id: string;
  organizationId: string;
};

export type UncompleteTaskCommand = {
  id: string;
  organizationId: string;
};

export type PinTaskCommand = {
  id: string;
  organizationId: string;
};

export type UnpinTaskCommand = {
  id: string;
  organizationId: string;
};

export type DeleteTaskCommand = {
  id: string;
  organizationId: string;
};
