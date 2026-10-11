import { HISTORY_STARTS_AT, type TimelineEntry } from '@yoink/api-contracts';

const actorName = (entry: TimelineEntry): string => entry.actor.name ?? 'Unknown';

const quoted = (title: string | null): string =>
  title && title.length > 0 ? `'${title}'` : 'a task';

const when = (occurredAt: string): string =>
  new Date(occurredAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const formatHistoryStartsLine = (iso: string = HISTORY_STARTS_AT): string => {
  const formatted = new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  });
  return `History starts ${formatted}`;
};

/** Only a project created before story 2, with no further pages, shows the start line. */
export const shouldShowHistoryStartLine = (input: {
  hasMore: boolean;
  createdAt: string;
  historyStartsAt?: string;
}): boolean =>
  input.hasMore !== true &&
  input.createdAt < (input.historyStartsAt ?? HISTORY_STARTS_AT);

export const joinChangedFields = (fields: readonly string[]): string => {
  if (fields.length === 0) {
    return 'details';
  }
  if (fields.length === 1) {
    return fields[0] ?? 'details';
  }
  if (fields.length === 2) {
    return `${fields[0]} and ${fields[1]}`;
  }
  const last = fields[fields.length - 1];
  return `${fields.slice(0, -1).join(', ')} and ${last}`;
};

export const taskUpdatedFieldLabels = (details: {
  title?: string;
  dueDate?: string | null;
  assigneeId?: string | null;
  listId?: string | null;
}): string[] => {
  const fields: string[] = [];
  if (details.title !== undefined) {
    fields.push('title');
  }
  if (details.dueDate !== undefined) {
    fields.push('due date');
  }
  if (details.assigneeId !== undefined) {
    fields.push('owner');
  }
  if (details.listId !== undefined) {
    fields.push('list');
  }
  return fields;
};

export const projectUpdatedFieldLabels = (details: {
  name?: string;
  objective?: string | null;
}): string[] => {
  const fields: string[] = [];
  if (details.name !== undefined) {
    fields.push('name');
  }
  if (details.objective !== undefined) {
    fields.push('objective');
  }
  return fields;
};

export const NEXT_ACTION_CLEAR_REASON_COPY = {
  cleared: 'cleared',
  completed: 'completed',
  deleted: 'deleted',
  removedFromProject: 'removed from the project',
  projectDone: 'project marked done',
} as const;

export const formatFinishedByLine = (input: {
  name: string;
  completedAt: string;
}): string => {
  const date = new Date(input.completedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `Finished by ${input.name} · ${date}`;
};

export const formatTimelineLine = (entry: TimelineEntry): string => {
  const who = actorName(entry);
  const title = entry.subject.title;
  const stamp = when(entry.occurredAt);

  switch (entry.details.kind) {
    case 'Unknown':
      return `${who} changed something · ${stamp}`;
    case 'TaskCreated':
      return `${who} added ${quoted(title)} · ${stamp}`;
    case 'TaskUpdated': {
      const isRename =
        entry.details.title !== undefined && entry.details.previousTitle !== undefined;
      const otherFields = taskUpdatedFieldLabels({
        title: isRename ? undefined : entry.details.title,
        dueDate: entry.details.dueDate,
        assigneeId: entry.details.assigneeId,
        listId: entry.details.listId,
      });
      if (isRename) {
        const renamed = `${who} renamed ${quoted(entry.details.previousTitle ?? null)} to ${quoted(entry.details.title)}`;
        if (otherFields.length === 0) {
          return `${renamed} · ${stamp}`;
        }
        return `${renamed} and changed ${joinChangedFields(otherFields)} · ${stamp}`;
      }
      return `${who} changed ${joinChangedFields(otherFields)} on ${quoted(title)} · ${stamp}`;
    }
    case 'TaskCompleted':
      return `${who} completed ${quoted(title)} · ${stamp}`;
    case 'TaskUncompleted':
      return `${who} reopened ${quoted(title)} · ${stamp}`;
    case 'TaskDeleted':
      return `${who} deleted ${quoted(title)} · ${stamp}`;
    case 'ProjectCreated':
      return `${who} created this project · ${stamp}`;
    case 'ProjectUpdated':
      return `${who} changed ${joinChangedFields(projectUpdatedFieldLabels(entry.details))} · ${stamp}`;
    case 'ProjectStatusChanged':
      return `${who} marked this project ${entry.details.to} · ${stamp}`;
    case 'ProjectWaitingChanged':
      return `${who} changed waiting on to '${entry.details.waitingOn}' · ${stamp}`;
    case 'ProjectNextActionSet':
      return `${who} set next action to ${quoted(entry.details.taskTitle)} · ${stamp}`;
    case 'ProjectNextActionCleared': {
      const reason = NEXT_ACTION_CLEAR_REASON_COPY[entry.details.reason];
      return `${who} cleared the next action ${quoted(entry.details.taskTitle)} (${reason}) · ${stamp}`;
    }
    case 'TaskAddedToProject':
      return `${who} moved ${quoted(title)} in · ${stamp}`;
    case 'TaskRemovedFromProject':
      return `${who} moved ${quoted(title)} out · ${stamp}`;
    case 'ProjectImported': {
      const count = entry.details.taskCount;
      const tasks = count === 1 ? '1 task' : `${count} tasks`;
      return `${who} · Moved in · ${tasks} · ${stamp}`;
    }
  }
};
