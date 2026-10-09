import type { ResultAsync } from 'neverthrow';
import type { Task, TaskFilter } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { StorageError } from './task-errors.js';

export type FindByOrganizationOptions = {
  organizationId: string;
  filter?: TaskFilter;
  today?: string;
  assigneeId?: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type TaskStore = {
  save(task: Task): ResultAsync<void, StorageError>;
  findById(id: string): ResultAsync<Task | null, StorageError>;
  update(task: Task): ResultAsync<void, StorageError>;
  findByOrganization(
    options: FindByOrganizationOptions
  ): ResultAsync<KeysetRows<Task>, StorageError>;
  findByCaptureId(captureId: string): ResultAsync<Task | null, StorageError>;
  softDelete(id: string): ResultAsync<void, StorageError>;
  countOpenOnList(listId: string): ResultAsync<number, StorageError>;
  clearListIdOnCompleted(listId: string): ResultAsync<void, StorageError>;
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
  nextOpenOrderInPile(options: {
    organizationId: string;
    listId: string | null;
  }): ResultAsync<number, StorageError>;
  setOpenOrders(
    updates: { id: string; openOrder: number }[]
  ): ResultAsync<void, StorageError>;
};
