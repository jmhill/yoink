import type { ResultAsync } from 'neverthrow';
import type { NamedList, Task } from '@yoink/api-contracts';
import type { StorageError } from '../domain/list-errors.js';
import type { NamedListEvent } from '../domain/events.js';

export type ListNamedLists = (
  organizationId: string
) => ResultAsync<NamedList[], StorageError>;

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
  listId: string
) => ResultAsync<Task[], StorageError>;

export type LoadTasksByIds = (ids: string[]) => ResultAsync<Task[], StorageError>;

export type PersistOpenTaskOrders = (
  updates: { id: string; openOrder: number }[]
) => ResultAsync<void, StorageError>;
