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

export const formatTimelineLine = (entry: TimelineEntry): string => {
  const who = actorName(entry);
  const title = entry.subject.title;
  const stamp = when(entry.occurredAt);

  switch (entry.details.kind) {
    case 'Unknown':
      return `${who} changed something · ${stamp}`;
    case 'TaskCreated':
      return `${who} added ${quoted(title)} · ${stamp}`;
    case 'TaskUpdated':
      return `${who} edited ${quoted(title)} · ${stamp}`;
    case 'TaskCompleted':
      return `${who} completed ${quoted(title)} · ${stamp}`;
    case 'TaskUncompleted':
      return `${who} reopened ${quoted(title)} · ${stamp}`;
    case 'TaskDeleted':
      return `${who} deleted ${quoted(title)} · ${stamp}`;
    case 'ProjectCreated':
      return `${who} created this project · ${stamp}`;
    case 'ProjectUpdated':
      if (entry.details.name) {
        return `${who} renamed this project to '${entry.details.name}' · ${stamp}`;
      }
      return `${who} edited this project · ${stamp}`;
    case 'ProjectStatusChanged':
      return `${who} marked this project ${entry.details.to} · ${stamp}`;
    case 'ProjectWaitingChanged':
      return `${who} changed waiting on to '${entry.details.waitingOn}' · ${stamp}`;
    case 'ProjectNextActionSet':
      return `${who} set next action to ${quoted(entry.details.taskTitle)} · ${stamp}`;
    case 'ProjectNextActionCleared':
      return entry.details.reason === 'deleted'
        ? `${who} cleared the next action (deleted) · ${stamp}`
        : `${who} cleared the next action (${entry.details.reason}) · ${stamp}`;
    case 'TaskAddedToProject':
      return `${who} moved ${quoted(title)} in · ${stamp}`;
    case 'TaskRemovedFromProject':
      return `${who} moved ${quoted(title)} out · ${stamp}`;
  }
};
