import type { Task } from '@yoink/api-contracts';
import type { TaskEvent } from '../domain/events.js';

export type WriteResult<E extends TaskEvent = TaskEvent> = {
  event: E;
  view: Task;
};
