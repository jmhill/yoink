import type { Task } from '@yoink/api-contracts';
import type {
  ApplyableTaskEvent,
  TaskCreated,
} from './events.js';

export type ApplyTaskMeta = {
  actorUserId: string | null;
};

const withLastChanged = (task: Task, occurredAt: string, meta: ApplyTaskMeta): Task => ({
  ...task,
  lastChangedAt: occurredAt,
  lastChangedBy: meta.actorUserId,
});

export const applyTaskCreated = (event: TaskCreated, meta: ApplyTaskMeta): Task => {
  const created: Task = {
    id: event.id,
    organizationId: event.organizationId,
    createdById: event.createdById,
    title: event.title,
    createdAt: event.createdAt,
    openOrder: event.openOrder,
    lastChangedAt: event.occurredAt,
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
  if (event.projectId !== undefined) {
    created.projectId = event.projectId;
  }

  return created;
};

export const applyTaskMutation = (
  current: Task,
  event: Exclude<ApplyableTaskEvent, TaskCreated>,
  meta: ApplyTaskMeta
): Task => {
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

      if (event.projectId !== undefined) {
        if (event.projectId === null) {
          delete updated.projectId;
        } else {
          updated.projectId = event.projectId;
        }
      }

      if (event.openOrder !== undefined) {
        updated.openOrder = event.openOrder;
      }

      return withLastChanged(updated, event.occurredAt, meta);
    }
    case 'TaskCompleted': {
      return withLastChanged(
        {
          ...current,
          completedAt: event.completedAt,
          completedBy: meta.actorUserId,
        },
        event.occurredAt,
        meta
      );
    }
    case 'TaskUncompleted': {
      const updated: Task = {
        ...current,
        openOrder: event.openOrder,
        completedBy: null,
      };
      delete updated.completedAt;
      return withLastChanged(updated, event.occurredAt, meta);
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
