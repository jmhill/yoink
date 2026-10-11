import type { HistoryPage, TimelineEntry } from '@yoink/api-contracts';

export type ListProjectHistoryQuery = {
  projectId: string;
  organizationId: string;
  limit?: number;
  cursor?: string;
};

export type ListTaskHistoryQuery = {
  taskId: string;
  organizationId: string;
  limit?: number;
  cursor?: string;
};

export type ListFinishedTasksOnProjectQuery = {
  projectId: string;
  organizationId: string;
  limit?: number;
  cursor?: string;
  completedAfter?: string;
  completedBefore?: string;
};

export type ListHistoryQueryResult = HistoryPage;

export type ListHistoryEntry = TimelineEntry;
