import type { ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../../../../kernel/listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../../../../kernel/listing/domain/listed-page.js';
import type { StorageError } from '../../../domain/messages/task-errors.js';
import type { FindByOrganizationOptions } from '../../../domain/messages/task-page.js';

export type { FindByOrganizationOptions };

export type TaskStore = {
  findById(id: string): ResultAsync<Task | null, StorageError>;
  findByIds(ids: readonly string[]): ResultAsync<Task[], StorageError>;
  findByIdIncludingDeleted(id: string): ResultAsync<Task | null, StorageError>;
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
  pageFinishedInProject(options: {
    organizationId: string;
    projectId: string;
    fetchLimit: number;
    seek?: KeysetCursor;
    completedAfter?: string;
    completedBefore?: string;
  }): ResultAsync<KeysetRows<Task>, StorageError>;
  pageFinishedWithProject(options: {
    organizationId: string;
    completedAfter: string;
    completedBefore: string;
    fetchLimit: number;
    seek?: KeysetCursor;
  }): ResultAsync<KeysetRows<Task>, StorageError>;
  countFinishedWithoutProject(options: {
    organizationId: string;
    completedAfter: string;
    completedBefore: string;
  }): ResultAsync<number, StorageError>;
  nextOpenOrderInPile(options: {
    organizationId: string;
    listId: string | null;
  }): ResultAsync<number, StorageError>;
};
