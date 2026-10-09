import type { ResultAsync } from 'neverthrow';
import type { NamedList, Task } from '@yoink/api-contracts';
import type { StorageError } from '../domain/list-errors.js';
import type { NamedListEvent } from '../domain/events.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';

export type ListNamedLists = (
  organizationId: string
) => ResultAsync<NamedList[], StorageError>;

export type PageNamedLists = (options: {
  organizationId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<NamedList>, StorageError>;

export type LoadNamedList = (
  id: string
) => ResultAsync<NamedList | null, StorageError>;

export type CountOpenTasksOnList = (
  listId: string
) => ResultAsync<number, StorageError>;

export type ClearCompletedListIds = (
  listId: string
) => ResultAsync<void, StorageError>;

export type PersistNamedListEvent = (input: {
  event: NamedListEvent;
}) => ResultAsync<void, StorageError>;

export type LoadOpenTasksOnList = (
  organizationId: string,
  listId: string | null
) => ResultAsync<Task[], StorageError>;

export type PageOpenTasksOnList = (options: {
  organizationId: string;
  listId: string | null;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<Task>, StorageError>;

export type LoadTasksByIds = (ids: string[]) => ResultAsync<Task[], StorageError>;

export type PersistOpenTaskOrders = (
  updates: { id: string; openOrder: number }[]
) => ResultAsync<void, StorageError>;
