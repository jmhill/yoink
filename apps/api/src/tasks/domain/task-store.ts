import type { ResultAsync } from 'neverthrow';
import type { Task, TaskFilter } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { StorageError } from './task-errors.js';

export type FindByOrganizationOptions = {
  organizationId: string;
  filter?: TaskFilter; // 'today' | 'upcoming' | 'all' | 'completed' | 'mine'
  today?: string; // Current date in YYYY-MM-DD format for date comparisons
  /** Caller principal id; used when filter is 'mine' */
  assigneeId?: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type TaskStore = {
  findById(id: string): ResultAsync<Task | null, StorageError>;
  findByOrganization(
    options: FindByOrganizationOptions
  ): ResultAsync<KeysetRows<Task>, StorageError>;
  findByCaptureId(captureId: string): ResultAsync<Task | null, StorageError>;
  countOpenOnList(listId: string): ResultAsync<number, StorageError>;
  findOpenInPile(options: {
    organizationId: string;
    listId: string | null;
  }): ResultAsync<Task[], StorageError>;
  pageOpenInPile(options: {
    organizationId: string;
    listId: string | null;
    fetchLimit: number;
    seek?: KeysetCursor;
  }): ResultAsync<KeysetRows<Task>, StorageError>;
  pageOpenInProject(options: {
    organizationId: string;
    projectId: string;
    fetchLimit: number;
    seek?: KeysetCursor;
  }): ResultAsync<KeysetRows<Task>, StorageError>;
  nextOpenOrderInPile(options: {
    organizationId: string;
    listId: string | null;
  }): ResultAsync<number, StorageError>;
};
