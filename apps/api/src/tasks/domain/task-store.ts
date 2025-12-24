import type { ResultAsync } from 'neverthrow';
import type { Task, TaskFilter } from '@yoink/api-contracts';
import type { StorageError } from './task-errors.js';

export type FindByOrganizationOptions = {
  organizationId: string;
  filter?: TaskFilter; // 'today' | 'upcoming' | 'all' | 'completed'
  today?: string; // Current date in YYYY-MM-DD format for date comparisons
  limit?: number;
  cursor?: string;
};

export type FindByOrganizationResult = {
  tasks: Task[];
  nextCursor?: string;
};

export type TaskStore = {
  save(task: Task): ResultAsync<void, StorageError>;
  findById(id: string): ResultAsync<Task | null, StorageError>;
  update(task: Task): ResultAsync<void, StorageError>;
  findByOrganization(
    options: FindByOrganizationOptions
  ): ResultAsync<FindByOrganizationResult, StorageError>;
  findByCaptureId(captureId: string): ResultAsync<Task | null, StorageError>;
  softDelete(id: string): ResultAsync<void, StorageError>;
};
