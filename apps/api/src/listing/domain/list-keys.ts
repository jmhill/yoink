import type {
  Capture,
  NamedList,
  NoteListItem,
  NowNextActionItem,
  Project,
  Task,
} from '@yoink/api-contracts';
import type { ListedCursor } from './keyset-cursor.js';
import type { KeysetDirection } from './keyset-window.js';

export type FinishedTask = Task & { readonly completedAt: string };

export const asFinishedTask = (task: Task): FinishedTask | null => {
  if (typeof task.completedAt !== 'string' || task.completedAt.length === 0) {
    return null;
  }
  return { ...task, completedAt: task.completedAt };
};

const UNPINNED_SENTINEL = '';
const MISSING_OPEN_ORDER = 2_147_483_647;

export const taskBoardCursor: ListedCursor<Task, 'tasks.board'> = {
  view: 'tasks.board',
  of: (task) => ({
    view: 'tasks.board',
    keys: [task.pinnedAt ?? UNPINNED_SENTINEL, task.createdAt, task.id],
  }),
};

export const completedTaskCursor: ListedCursor<FinishedTask, 'tasks.completed'> = {
  view: 'tasks.completed',
  of: (task) => ({
    view: 'tasks.completed',
    keys: [task.completedAt, task.id],
  }),
};

export const openPileTaskCursor: ListedCursor<Task, 'tasks.pile'> = {
  view: 'tasks.pile',
  of: (task) => ({
    view: 'tasks.pile',
    keys: [task.openOrder ?? MISSING_OPEN_ORDER, task.createdAt, task.id],
  }),
};

export const projectTaskCursor: ListedCursor<Task, 'tasks.project'> = {
  view: 'tasks.project',
  of: (task) => ({
    view: 'tasks.project',
    keys: [task.createdAt, task.id],
  }),
};

export const finishedProjectTaskCursor: ListedCursor<FinishedTask, 'tasks.project.finished'> = {
  view: 'tasks.project.finished',
  of: (task) => ({
    view: 'tasks.project.finished',
    keys: [task.completedAt, task.id],
  }),
};

export type HistoryCursorRow = {
  occurredAt: string;
  seq: number;
};

export const projectHistoryCursor: ListedCursor<HistoryCursorRow, 'history.project'> = {
  view: 'history.project',
  of: (row) => ({
    view: 'history.project',
    keys: [row.occurredAt, row.seq],
  }),
};

export const taskHistoryCursor: ListedCursor<HistoryCursorRow, 'history.task'> = {
  view: 'history.task',
  of: (row) => ({
    view: 'history.task',
    keys: [row.occurredAt, row.seq],
  }),
};

export const namedListCursor: ListedCursor<NamedList, 'lists'> = {
  view: 'lists',
  of: (list) => ({
    view: 'lists',
    keys: [list.name, list.createdAt, list.id],
  }),
};

export const projectCursor: ListedCursor<Project, 'projects'> = {
  view: 'projects',
  of: (project) => ({
    view: 'projects',
    keys: [project.name, project.createdAt, project.id],
  }),
};

export const captureFeedCursor: ListedCursor<Capture, 'captures.feed'> = {
  view: 'captures.feed',
  of: (capture) => ({
    view: 'captures.feed',
    keys: [capture.capturedAt, capture.id],
  }),
};

export const snoozedCaptureCursor: ListedCursor<Capture, 'captures.snoozed'> = {
  view: 'captures.snoozed',
  of: (capture) => ({
    view: 'captures.snoozed',
    keys: [capture.snoozedUntil ?? '', capture.id],
  }),
};

export const UNDATED_DUE_SENTINEL = '9999-12-31';

export const workNextActionCursor: ListedCursor<NowNextActionItem, 'work.next-actions'> = {
  view: 'work.next-actions',
  of: (item) => ({
    view: 'work.next-actions',
    keys: [
      item.task.dueDate ?? UNDATED_DUE_SENTINEL,
      item.project.name.toLowerCase(),
      item.task.id,
    ],
  }),
};

export const workDueCursor: ListedCursor<Task, 'work.due'> = {
  view: 'work.due',
  of: (task) => ({
    view: 'work.due',
    keys: [task.dueDate ?? UNDATED_DUE_SENTINEL, task.createdAt, task.id],
  }),
};

export type WorkListCursorRow = {
  id: string;
  name: string;
  createdAt: string;
  openTaskCount: number;
};

export const workListCursor: ListedCursor<WorkListCursorRow, 'work.lists'> = {
  view: 'work.lists',
  of: (list) => ({
    view: 'work.lists',
    keys: [list.name, list.createdAt, list.id],
  }),
};

export type ReviewCursorRow = {
  readonly sectionRank: string;
  readonly groupOldestSince: string;
  readonly groupName: string;
  readonly rowWaitingSince: string;
  readonly project: { readonly id: string; readonly name: string };
};

export const reviewCursor: ListedCursor<ReviewCursorRow, 'review'> = {
  view: 'review',
  of: (item) => ({
    view: 'review',
    keys: [
      item.sectionRank,
      item.groupOldestSince,
      item.groupName,
      item.rowWaitingSince,
      item.project.name.toLowerCase(),
      item.project.id,
    ],
  }),
};

export const doneListCursor: ListedCursor<FinishedTask, 'review.done'> = {
  view: 'review.done',
  of: (task) => ({
    view: 'review.done',
    keys: [task.completedAt, task.id],
  }),
};

export const projectNotesCursor: ListedCursor<NoteListItem, 'notes.project'> = {
  view: 'notes.project',
  of: (note) => ({
    view: 'notes.project',
    keys: [note.updatedAt, note.id],
  }),
};

export type NotesChangedCursorRow = {
  readonly updatedAt: string;
  readonly id: string;
};

export const notesChangedCursor: ListedCursor<NotesChangedCursorRow, 'notes.changed'> = {
  view: 'notes.changed',
  of: (row) => ({
    view: 'notes.changed',
    keys: [row.updatedAt, row.id],
  }),
};

export const taskBoardKeys = (task: Task) => taskBoardCursor.of(task).keys;
export const completedTaskKeys = (task: FinishedTask) => completedTaskCursor.of(task).keys;
export const openPileTaskKeys = (task: Task) => openPileTaskCursor.of(task).keys;
export const projectTaskKeys = (task: Task) => projectTaskCursor.of(task).keys;
export const finishedProjectTaskKeys = (task: FinishedTask) =>
  finishedProjectTaskCursor.of(task).keys;
export const projectHistoryKeys = (row: HistoryCursorRow) => projectHistoryCursor.of(row).keys;
export const taskHistoryKeys = (row: HistoryCursorRow) => taskHistoryCursor.of(row).keys;
export const namedListKeys = (list: NamedList) => namedListCursor.of(list).keys;
export const projectKeys = (project: Project) => projectCursor.of(project).keys;
export const captureFeedKeys = (capture: Capture) => captureFeedCursor.of(capture).keys;
export const snoozedCaptureKeys = (capture: Capture) => snoozedCaptureCursor.of(capture).keys;
export const workNextActionKeys = (item: NowNextActionItem) => workNextActionCursor.of(item).keys;
export const workDueKeys = (task: Task) => workDueCursor.of(task).keys;
export const workListKeys = (list: WorkListCursorRow) => workListCursor.of(list).keys;
export const reviewKeys = (item: ReviewCursorRow) => reviewCursor.of(item).keys;
export const doneListKeys = (task: FinishedTask) => doneListCursor.of(task).keys;
export const projectNotesKeys = (note: NoteListItem) => projectNotesCursor.of(note).keys;
export const notesChangedKeys = (row: NotesChangedCursorRow) => notesChangedCursor.of(row).keys;

export const taskBoardDirection: KeysetDirection = 'desc';
export const completedTaskDirection: KeysetDirection = 'desc';
export const openPileTaskDirection: KeysetDirection = 'asc';
export const projectTaskDirection: KeysetDirection = 'desc';
export const finishedProjectTaskDirection: KeysetDirection = 'desc';
export const projectHistoryDirection: KeysetDirection = 'desc';
export const taskHistoryDirection: KeysetDirection = 'desc';
export const namedListDirection: KeysetDirection = 'asc';
export const projectDirection: KeysetDirection = 'asc';
export const captureFeedDirection: KeysetDirection = 'desc';
export const snoozedCaptureDirection: KeysetDirection = 'asc';
export const workNextActionDirection: KeysetDirection = 'asc';
export const workDueDirection: KeysetDirection = 'asc';
export const workListDirection: KeysetDirection = 'asc';
export const reviewDirection: KeysetDirection = 'asc';
export const doneListDirection: KeysetDirection = 'desc';
export const projectNotesDirection: KeysetDirection = 'desc';
export const notesChangedDirection: KeysetDirection = 'asc';
