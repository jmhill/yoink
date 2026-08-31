import type { Task } from '@yoink/api-contracts';
import type { TaskEvent } from './events.js';

export const applyTaskEvent = (current: Task | null, event: TaskEvent): Task => {
  if (event.type === 'TaskCreated') {
    const created: Task = {
      id: event.id,
      organizationId: event.organizationId,
      createdById: event.createdById,
      title: event.title,
      createdAt: event.createdAt,
    };

    if (event.dueDate !== undefined) {
      created.dueDate = event.dueDate;
    }
    if (event.captureId !== undefined) {
      created.captureId = event.captureId;
    }
    if (event.assigneeId !== undefined) {
      created.assigneeId = event.assigneeId;
    }
    if (event.listId !== undefined) {
      created.listId = event.listId;
    }

    return created;
  }

  if (!current) {
    throw new Error(`Cannot apply ${event.type} without current state`);
  }

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
        if (event.listId === null) {
          delete updated.listId;
        } else {
          updated.listId = event.listId;
        }
      }

      return updated;
    }
  }
};
