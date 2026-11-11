/**
 * Timeline document. The module owns this shape.
 * The public API edge maps it onto the contract history page.
 * The instant matches the contract constant so the wire field stays the same.
 */
export const HISTORY_STARTS_AT = '2026-10-10T13:56:00.000Z';

export type TimelineActorKind = 'user' | 'bot';

export type TimelineActor = {
  userId: string | null;
  kind: TimelineActorKind | null;
  name: string | null;
};

export type TimelineSubjectType = 'task' | 'project' | 'note';

export type TimelineSubject = {
  type: TimelineSubjectType;
  id: string;
  title: string | null;
  deleted: boolean;
};

export type TimelineProjectStatus =
  | 'active'
  | 'waiting'
  | 'someday'
  | 'done'
  | 'proposed'
  | 'declined';

export type TimelineDetails =
  | { kind: 'Unknown' }
  | {
      kind: 'TaskCreated';
      via?: 'import';
      projectName?: string | null;
    }
  | {
      kind: 'TaskUpdated';
      title?: string;
      previousTitle?: string;
      dueDate?: string | null;
      assigneeId?: string | null;
      listId?: string | null;
    }
  | { kind: 'TaskCompleted' }
  | { kind: 'TaskUncompleted' }
  | { kind: 'TaskDeleted' }
  | {
      kind: 'ProjectCreated';
      name: string;
      objective?: string;
      status?: 'active' | 'someday' | 'proposed';
      captureId?: string;
    }
  | {
      kind: 'ProjectUpdated';
      name?: string;
      objective?: string | null;
      notebookPages?: string[];
    }
  | {
      kind: 'ProjectStatusChanged';
      from: TimelineProjectStatus;
      to: TimelineProjectStatus;
      waitingOn?: string | null;
      waitingSince?: string | null;
    }
  | {
      kind: 'ProjectWaitingChanged';
      waitingOn: string;
      waitingSince: string | null;
    }
  | {
      kind: 'ProjectNextActionSet';
      taskId: string;
      taskTitle: string | null;
      previousTaskId: string | null;
      previousTaskTitle: string | null;
    }
  | {
      kind: 'ProjectNextActionCleared';
      taskId: string;
      taskTitle: string | null;
      reason: 'cleared' | 'completed' | 'deleted' | 'removedFromProject' | 'projectDone';
    }
  | {
      kind: 'TaskAddedToProject';
      projectId: string;
      projectName?: string | null;
      via?: 'import';
    }
  | {
      kind: 'TaskRemovedFromProject';
      projectId: string;
      toProjectName?: string | null;
    }
  | { kind: 'ProjectImported'; taskCount: number }
  | { kind: 'NoteCreated'; title: string; origin?: 'obsidian' }
  | {
      kind: 'NoteUpdated';
      title: string;
      titleChanged: boolean;
      bodyChanged: boolean;
      origin?: 'obsidian';
    }
  | { kind: 'NoteDeleted'; title: string };

export type TimelineEntryKind = TimelineDetails['kind'];

export type TimelineEntry = {
  id: string;
  kind: TimelineEntryKind;
  occurredAt: string;
  actor: TimelineActor;
  subject: TimelineSubject;
  details: TimelineDetails;
};

export type HistoryPage = {
  entries: TimelineEntry[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
  historyStartsAt: string;
};
