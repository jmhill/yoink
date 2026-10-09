import type { ResultAsync } from 'neverthrow';
import type { NamedList, Task } from '@yoink/api-contracts';
import type { Actor } from '../../shared/actor.js';
import type { TaskEvent } from '../domain/events.js';
import type { StorageError } from '../domain/task-errors.js';
import type { FindByOrganizationOptions } from '../domain/task-store.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';

export type PersistTaskEvent = (input: {
  event: TaskEvent;
  current: Task | null;
  actor: Actor | null;
  now: string;
}) => ResultAsync<void, StorageError>;

export type LoadTask = (id: string) => ResultAsync<Task | null, StorageError>;

export type LoadNamedList = (
  id: string
) => ResultAsync<NamedList | null, StorageError>;

export type LoadNextOpenOrder = (
  organizationId: string,
  listId: string | null
) => ResultAsync<number, StorageError>;

export type LoadOpenTasksInPile = (
  organizationId: string,
  listId: string | null
) => ResultAsync<Task[], StorageError>;

export type ListTasks = (
  options: FindByOrganizationOptions
) => ResultAsync<KeysetRows<Task>, StorageError>;
