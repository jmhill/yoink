import { HISTORY_STARTS_AT, type TimelineEntry } from '@yoink/api-contracts';
import { formatWaitingSinceLabel } from './format-waiting-line.js';

const actorName = (entry: TimelineEntry): string => entry.actor.name ?? 'Unknown';

const quoted = (title: string | null): string =>
  title && title.length > 0 ? `'${title}'` : 'a task';

export const formatShortDate = (iso: string, now = new Date()): string => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = dateOnly ? new Date(`${iso}T00:00:00`) : new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('en-US', options);
};

export const formatTimelineStamp = (occurredAt: string, now = new Date()): string => {
  const date = new Date(occurredAt);
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleString('en-US', options);
};

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
    fields.push('the title');
  }
  if (details.dueDate !== undefined) {
    fields.push('the due date');
  }
  if (details.assigneeId !== undefined) {
    fields.push('the owner');
  }
  if (details.listId !== undefined) {
    fields.push('the list');
  }
  return fields;
};

export const projectUpdatedFieldLabels = (details: {
  name?: string;
  objective?: string | null;
  notebookPages?: string[];
}): string[] => {
  const fields: string[] = [];
  if (details.name !== undefined) {
    fields.push('the name');
  }
  if (details.objective !== undefined) {
    fields.push('the objective');
  }
  if (details.notebookPages !== undefined) {
    fields.push('the notebook pages');
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

type NextActionClearedDetails = Extract<
  TimelineEntry['details'],
  { kind: 'ProjectNextActionCleared' }
>;

const sameSaveCompanion = (
  entry: TimelineEntry,
  details: NextActionClearedDetails,
  other: TimelineEntry
): boolean => {
  if (other.id === entry.id || other.occurredAt !== entry.occurredAt) {
    return false;
  }
  switch (details.reason) {
    case 'completed':
      return other.kind === 'TaskCompleted' && other.subject.id === details.taskId;
    case 'deleted':
      return other.kind === 'TaskDeleted' && other.subject.id === details.taskId;
    case 'removedFromProject':
      return other.kind === 'TaskRemovedFromProject' && other.subject.id === details.taskId;
    case 'projectDone':
      return (
        other.details.kind === 'ProjectStatusChanged' && other.details.to === 'done'
      );
    case 'cleared':
      return false;
  }
};

/** Automatic clears stay in the API; the web timeline hides them when the companion event is here. */
export const isAutomaticNextActionClear = (
  entry: TimelineEntry,
  entries: readonly TimelineEntry[]
): boolean => {
  if (entry.details.kind !== 'ProjectNextActionCleared') {
    return false;
  }
  const details = entry.details;
  if (details.reason === 'cleared') {
    return false;
  }
  return entries.some((other) => sameSaveCompanion(entry, details, other));
};

export const visibleWebTimelineEntries = (
  entries: readonly TimelineEntry[]
): TimelineEntry[] => entries.filter((entry) => !isAutomaticNextActionClear(entry, entries));

export const formatFinishedLine = (input: {
  title: string;
  name: string;
  completedAt: string;
  now?: Date;
}): string => {
  const date = formatShortDate(input.completedAt, input.now);
  return `${input.title} · Finished by ${input.name} · ${date}`;
};

export const formatFinishedByLine = (input: {
  name: string;
  completedAt: string;
  now?: Date;
}): string => {
  const date = formatShortDate(input.completedAt, input.now);
  return `Finished by ${input.name} · ${date}`;
};

export const formatTimelineLine = (entry: TimelineEntry): string => {
  const who = actorName(entry);
  const title = entry.subject.title;

  switch (entry.details.kind) {
    case 'Unknown':
      return `${who} changed something`;
    case 'TaskCreated':
      if (entry.details.via === 'import' && entry.details.projectName) {
        return `${who} added ${quoted(title)} in ${quoted(entry.details.projectName)}`;
      }
      return `${who} added ${quoted(title)}`;
    case 'TaskUpdated': {
      const newTitle = entry.details.title;
      const oldTitle = entry.details.previousTitle;
      const isRename = newTitle !== undefined && oldTitle !== undefined;
      const otherFields = taskUpdatedFieldLabels({
        title: isRename ? undefined : newTitle,
        dueDate: entry.details.dueDate,
        assigneeId: entry.details.assigneeId,
        listId: entry.details.listId,
      });
      if (isRename) {
        const renamed = `${who} renamed ${quoted(oldTitle)} to ${quoted(newTitle)}`;
        if (otherFields.length === 0) {
          return renamed;
        }
        return `${renamed} and changed ${joinChangedFields(otherFields)}`;
      }
      return `${who} changed ${joinChangedFields(otherFields)} on ${quoted(title)}`;
    }
    case 'TaskCompleted':
      return `${who} completed ${quoted(title)}`;
    case 'TaskUncompleted':
      return `${who} reopened ${quoted(title)}`;
    case 'TaskDeleted':
      return `${who} deleted ${quoted(title)}`;
    case 'ProjectCreated':
      if (entry.details.status === 'proposed') {
        return `${who} proposed this project`;
      }
      return entry.details.captureId
        ? `${who} created this project from a capture`
        : `${who} created this project`;
    case 'ProjectUpdated':
      return `${who} changed ${joinChangedFields(projectUpdatedFieldLabels(entry.details))}`;
    case 'ProjectStatusChanged':
      if (entry.details.from === 'proposed' && entry.details.to === 'declined') {
        return `${who} turned it down`;
      }
      if (entry.details.from === 'declined' && entry.details.to === 'proposed') {
        return `${who} restored it`;
      }
      if (entry.details.from === 'proposed') {
        const confirmedAs =
          entry.details.to === 'active'
            ? 'Active'
            : entry.details.to === 'someday'
              ? 'Someday'
              : entry.details.to === 'waiting'
                ? 'Waiting'
                : entry.details.to;
        return `${who} confirmed it as ${confirmedAs}`;
      }
      return `${who} marked this project ${entry.details.to}`;
    case 'ProjectWaitingChanged': {
      const since = entry.details.waitingSince
        ? formatWaitingSinceLabel(entry.details.waitingSince)
        : 'unknown';
      return `${who} set waiting on ${entry.details.waitingOn} since ${since}`;
    }
    case 'ProjectNextActionSet':
      return `${who} set the next action to ${quoted(entry.details.taskTitle)}`;
    case 'ProjectNextActionCleared': {
      const reason = NEXT_ACTION_CLEAR_REASON_COPY[entry.details.reason];
      return `${who} cleared the next action ${quoted(entry.details.taskTitle)} (${reason})`;
    }
    case 'TaskAddedToProject':
      if (entry.details.via === 'import' && entry.details.projectName) {
        return `${who} moved ${quoted(title)} into ${quoted(entry.details.projectName)}`;
      }
      return `${who} moved ${quoted(title)} into the project`;
    case 'TaskRemovedFromProject': {
      if (entry.details.toProjectName && entry.details.toProjectName.length > 0) {
        return `${who} moved ${quoted(title)} to ${entry.details.toProjectName}`;
      }
      if (entry.details.toProjectName === null) {
        return `${who} moved ${quoted(title)} to another project`;
      }
      return `${who} took ${quoted(title)} out of the project`;
    }
    case 'ProjectImported': {
      const count = entry.details.taskCount;
      const tasks = count === 1 ? '1 task' : `${count} tasks`;
      return `${who} · Moved in · ${tasks}`;
    }
    case 'NoteCreated':
      if (entry.details.origin === 'obsidian') {
        return `${who} edited this note in Obsidian`;
      }
      return `${who} added the note ${quoted(entry.details.title)}`;
    case 'NoteUpdated': {
      if (entry.details.origin === 'obsidian') {
        return `${who} edited this note in Obsidian`;
      }
      const fields = [
        ...(entry.details.titleChanged ? ['the title'] : []),
        ...(entry.details.bodyChanged ? ['the body'] : []),
      ];
      return `${who} changed ${joinChangedFields(fields)} on ${quoted(entry.details.title)}`;
    }
    case 'NoteDeleted':
      return `${who} deleted the note ${quoted(entry.details.title)}`;
  }
};
