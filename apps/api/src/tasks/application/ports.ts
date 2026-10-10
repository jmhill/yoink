import type { ResultAsync } from 'neverthrow';
import type { NamedList, Task } from '@yoink/api-contracts';
import type { StorageError, TaskNotFoundError } from '../domain/task-errors.js';
import type { FindByOrganizationOptions } from '../domain/task-store.js';
import type { LoadedProject } from '../domain/task-commands.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { TaskChangePlan } from '../domain/plan-task-change.js';

export type PersistTaskChange = (
  plan: TaskChangePlan
) => ResultAsync<void, StorageError | TaskNotFoundError>;

export type LoadTask = (id: string) => ResultAsync<Task | null, StorageError>;

export type LoadNamedList = (
  id: string
) => ResultAsync<NamedList | null, StorageError>;

export type LoadProject = (
  id: string
) => ResultAsync<LoadedProject | null, StorageError>;

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
