import type { Task } from '@yoink/api-contracts';
import type { TaskEvent } from './events.js';

export const applyTaskEvent = (current: Task, event: TaskEvent): Task => {
  switch (event.type) {
    case 'TaskUpdated': {
      const updated: Task = {
        ...current,
        title: event.title ?? current.title,
      };

      if (event.dueDate !== undefined) {
        if (event.dueDate === null) {
          delete updated.dueDate;
        } else {
          updated.dueDate = event.dueDate;
        }
      }

      if (event.assigneeId !== undefined) {
        if (event.assigneeId === null) {
          delete updated.assigneeId;
        } else {
          updated.assigneeId = event.assigneeId;
        }
      }

      if (event.listId !== undefined) {
        updated.listId = event.listId;
      }

      return updated;
    }
  }
};
