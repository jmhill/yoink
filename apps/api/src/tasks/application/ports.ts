import type { ResultAsync } from 'neverthrow';
import type { NamedList, Task } from '@yoink/api-contracts';
import type { TaskEvent } from '../domain/events.js';
import type { StorageError } from '../domain/task-errors.js';

export type PersistTaskEvent = (input: {
  event: TaskEvent;
  current: Task;
}) => ResultAsync<void, StorageError>;

export type LoadTask = (id: string) => ResultAsync<Task | null, StorageError>;

export type LoadNamedList = (
  id: string
) => ResultAsync<NamedList | null, StorageError>;
