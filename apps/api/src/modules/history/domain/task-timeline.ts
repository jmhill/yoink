import type { IntegrationEvent } from '../../../kernel/integration-event.js';
import type { EventSinkMap, TimelineDraft } from './event-sink.js';

/**
 * History owns this map. It does not import task management. The type strings
 * are the published task, project, and list integration events. The draft on
 * the payload is the timeline row; TaskDeleted `source` is not stored.
 */
const TASK_TIMELINE_KINDS = [
  'TaskCreated',
  'TaskUpdated',
  'TaskCompleted',
  'TaskUncompleted',
  'TaskDeleted',
  'TaskPinned',
  'TaskUnpinned',
  'OpenTasksReordered',
  'OpenTasksRenumbered',
  'NamedListCreated',
  'NamedListRenamed',
  'NamedListDeleted',
  'ProjectCreated',
  'ProjectUpdated',
  'ProjectStatusChanged',
  'ProjectWaitingChanged',
  'ProjectNextActionSet',
  'ProjectNextActionCleared',
  'TaskAddedToProject',
  'TaskRemovedFromProject',
  'ProjectImported',
] as const;

const draftOf = (event: IntegrationEvent): TimelineDraft | undefined => {
  const payload = event.payload;
  if (typeof payload !== 'object' || payload === null || !('record' in payload)) {
    return undefined;
  }
  if ('timeline' in payload && payload.timeline === 'inline') {
    return undefined;
  }
  const record = payload.record;
  if (typeof record !== 'object' || record === null || !('kind' in record)) {
    return undefined;
  }
  if (record.kind !== event.type) {
    return undefined;
  }
  return record as TimelineDraft;
};

const build = (event: IntegrationEvent): readonly TimelineDraft[] => {
  const draft = draftOf(event);
  return draft === undefined ? [] : [draft];
};

export const TASK_TIMELINE_BUILDERS: EventSinkMap = Object.fromEntries(
  TASK_TIMELINE_KINDS.map((kind) => [kind, build])
);
