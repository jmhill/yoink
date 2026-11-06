import type { ListedCursor } from './keyset-cursor.js';
import type { KeysetDirection } from './keyset-window.js';

type HasCompletedAt = {
  readonly completedAt?: string | null;
};

/** `T` with `completedAt` present. Callers pass the contract document as `T`. */
export type FinishedTask<T extends HasCompletedAt> = T & { readonly completedAt: string };

export const asFinishedTask = <T extends HasCompletedAt>(task: T): FinishedTask<T> | null => {
  if (typeof task.completedAt !== 'string' || task.completedAt.length === 0) {
    return null;
  }
  return { ...task, completedAt: task.completedAt };
};

// Row shapes are the fields each cursor reads. The index signature keeps a
// fuller contract document assignable, including object literals, without
// importing `@yoink/api-contracts`.
type CursorRow = { readonly [field: string]: unknown };

type TaskBoardRow = CursorRow & {
  readonly id: string;
  readonly createdAt: string;
  readonly pinnedAt?: string | null;
};

type OpenPileRow = TaskBoardRow & {
  readonly openOrder?: number | null;
};

type ProjectTaskRow = CursorRow & {
  readonly id: string;
  readonly createdAt: string;
};

type CompletedCursorRow = CursorRow & {
  readonly id: string;
  readonly completedAt: string;
};

type DueCursorRow = CursorRow & {
  readonly id: string;
  readonly createdAt: string;
  readonly dueDate?: string | null;
};

type NamedCursorRow = CursorRow & {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
};

type CaptureFeedRow = CursorRow & {
  readonly id: string;
  readonly capturedAt: string;
};

type SnoozedCaptureRow = CursorRow & {
  readonly id: string;
  readonly snoozedUntil?: string | null;
};

type NextActionCursorRow = {
  readonly task: CursorRow & {
    readonly id: string;
    readonly dueDate?: string | null;
  };
  readonly project: CursorRow & {
    readonly name: string;
  };
};

type NoteCursorRow = CursorRow & {
  readonly id: string;
  readonly updatedAt: string;
};

const UNPINNED_SENTINEL = '';
const MISSING_OPEN_ORDER = 2_147_483_647;

export const taskBoardCursor: ListedCursor<TaskBoardRow, 'tasks.board'> = {
  view: 'tasks.board',
  of: (task) => ({
    view: 'tasks.board',
    keys: [task.pinnedAt ?? UNPINNED_SENTINEL, task.createdAt, task.id],
  }),
};

export const completedTaskCursor: ListedCursor<CompletedCursorRow, 'tasks.completed'> = {
  view: 'tasks.completed',
  of: (task) => ({
    view: 'tasks.completed',
    keys: [task.completedAt, task.id],
  }),
};

export const openPileTaskCursor: ListedCursor<OpenPileRow, 'tasks.pile'> = {
  view: 'tasks.pile',
  of: (task) => ({
    view: 'tasks.pile',
    keys: [task.openOrder ?? MISSING_OPEN_ORDER, task.createdAt, task.id],
  }),
};

export const projectTaskCursor: ListedCursor<ProjectTaskRow, 'tasks.project'> = {
  view: 'tasks.project',
  of: (task) => ({
    view: 'tasks.project',
    keys: [task.createdAt, task.id],
  }),
};

export const finishedProjectTaskCursor: ListedCursor<CompletedCursorRow, 'tasks.project.finished'> = {
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

export const namedListCursor: ListedCursor<NamedCursorRow, 'lists'> = {
  view: 'lists',
  of: (list) => ({
    view: 'lists',
    keys: [list.name, list.createdAt, list.id],
  }),
};

export const projectCursor: ListedCursor<NamedCursorRow, 'projects'> = {
  view: 'projects',
  of: (project) => ({
    view: 'projects',
    keys: [project.name, project.createdAt, project.id],
  }),
};

export const captureFeedCursor: ListedCursor<CaptureFeedRow, 'captures.feed'> = {
  view: 'captures.feed',
  of: (capture) => ({
    view: 'captures.feed',
    keys: [capture.capturedAt, capture.id],
  }),
};

export const snoozedCaptureCursor: ListedCursor<SnoozedCaptureRow, 'captures.snoozed'> = {
  view: 'captures.snoozed',
  of: (capture) => ({
    view: 'captures.snoozed',
    keys: [capture.snoozedUntil ?? '', capture.id],
  }),
};

export const UNDATED_DUE_SENTINEL = '9999-12-31';

export const workNextActionCursor: ListedCursor<NextActionCursorRow, 'work.next-actions'> = {
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

export const workDueCursor: ListedCursor<DueCursorRow, 'work.due'> = {
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

export const doneListCursor: ListedCursor<CompletedCursorRow, 'review.done'> = {
  view: 'review.done',
  of: (task) => ({
    view: 'review.done',
    keys: [task.completedAt, task.id],
  }),
};

export const projectNotesCursor: ListedCursor<NoteCursorRow, 'notes.project'> = {
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

export const taskBoardKeys = (task: TaskBoardRow) => taskBoardCursor.of(task).keys;
export const completedTaskKeys = (task: CompletedCursorRow) => completedTaskCursor.of(task).keys;
export const openPileTaskKeys = (task: OpenPileRow) => openPileTaskCursor.of(task).keys;
export const projectTaskKeys = (task: ProjectTaskRow) => projectTaskCursor.of(task).keys;
export const finishedProjectTaskKeys = (task: CompletedCursorRow) =>
  finishedProjectTaskCursor.of(task).keys;
export const projectHistoryKeys = (row: HistoryCursorRow) => projectHistoryCursor.of(row).keys;
export const taskHistoryKeys = (row: HistoryCursorRow) => taskHistoryCursor.of(row).keys;
export const namedListKeys = (list: NamedCursorRow) => namedListCursor.of(list).keys;
export const projectKeys = (project: NamedCursorRow) => projectCursor.of(project).keys;
export const captureFeedKeys = (capture: CaptureFeedRow) => captureFeedCursor.of(capture).keys;
export const snoozedCaptureKeys = (capture: SnoozedCaptureRow) =>
  snoozedCaptureCursor.of(capture).keys;
export const workNextActionKeys = (item: NextActionCursorRow) =>
  workNextActionCursor.of(item).keys;
export const workDueKeys = (task: DueCursorRow) => workDueCursor.of(task).keys;
export const workListKeys = (list: WorkListCursorRow) => workListCursor.of(list).keys;
export const reviewKeys = (item: ReviewCursorRow) => reviewCursor.of(item).keys;
export const doneListKeys = (task: CompletedCursorRow) => doneListCursor.of(task).keys;
export const projectNotesKeys = (note: NoteCursorRow) => projectNotesCursor.of(note).keys;
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
