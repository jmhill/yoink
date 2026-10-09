import type { Task } from '@yoink/api-contracts';
import type { TaskEvent } from './events.js';

export type ApplyTaskMeta = {
  now: string;
  actorUserId: string | null;
};

const withLastChanged = (task: Task, meta: ApplyTaskMeta): Task => ({
  ...task,
  lastChangedAt: meta.now,
  lastChangedBy: meta.actorUserId,
});

export const applyTaskEvent = (
  current: Task | null,
  event: TaskEvent,
  meta: ApplyTaskMeta
): Task => {
  if (event.type === 'TaskCreated') {
    const created: Task = {
      id: event.id,
      organizationId: event.organizationId,
      createdById: event.createdById,
      title: event.title,
      createdAt: event.createdAt,
      openOrder: event.openOrder,
      lastChangedAt: event.createdAt,
      lastChangedBy: meta.actorUserId,
      completedBy: null,
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

  if (event.type === 'TaskDeleted') {
    throw new Error('TaskDeleted has no task view');
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

      if (event.openOrder !== undefined) {
        updated.openOrder = event.openOrder;
      }

      return withLastChanged(updated, meta);
    }
    case 'TaskCompleted': {
      return withLastChanged(
        {
          ...current,
          completedAt: event.completedAt,
          completedBy: meta.actorUserId,
        },
        { now: event.completedAt, actorUserId: meta.actorUserId }
      );
    }
    case 'TaskUncompleted': {
      const updated: Task = {
        ...current,
        openOrder: event.openOrder,
        completedBy: null,
      };
      delete updated.completedAt;
      return withLastChanged(updated, meta);
    }
    case 'TaskPinned': {
      return {
        ...current,
        pinnedAt: event.pinnedAt,
      };
    }
    case 'TaskUnpinned': {
      const updated: Task = { ...current };
      delete updated.pinnedAt;
      return updated;
    }
  }
};
