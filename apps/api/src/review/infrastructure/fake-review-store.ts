import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import { DEFAULT_VIEWER_TIME_ZONE } from '../../shared/domain/viewer-today.js';
import { pageOrdered } from '../../listing/domain/keyset-window.js';
import { doneListDirection, doneListKeys, reviewDirection, reviewKeys } from '../../listing/domain/list-keys.js';
import {
  buildReviewItems,
  latestIsoInstant,
  type ReviewCandidate,
} from '../domain/build-review.js';
import { asFinishedTaskOrNull, type DoneListRow } from '../domain/group-done.js';
import { countReviewReasons } from '../domain/review-order.js';
import { storageError, type StorageError } from '../domain/review-errors.js';
import type {
  PageDoneListOptions,
  PageReviewOptions,
  ReviewChangeLogEntry,
  ReviewStore,
} from '../domain/review-store.js';

export type FakeReviewStoreOptions = {
  projects?: Project[];
  tasks?: Task[];
  changeLog?: ReviewChangeLogEntry[];
  deletedTaskIds?: readonly string[];
  timeZones?: Readonly<Record<string, string>>;
  shouldFail?: boolean;
};

const lastChangeAtFor = (
  project: Project,
  changeLog: readonly ReviewChangeLogEntry[]
): string => {
  const fromLog = changeLog
    .filter(
      (entry) =>
        entry.organizationId === project.organizationId && entry.projectId === project.id
    )
    .map((entry) => entry.occurredAt);
  return (
    latestIsoInstant([project.lastChangedAt, project.createdAt, ...fromLog]) ??
    project.createdAt
  );
};

const nextActionFor = (
  project: Project,
  tasks: readonly Task[],
  deleted: ReadonlySet<string>
): ReviewCandidate['nextAction'] => {
  if (project.nextActionTaskId === null) {
    return null;
  }
  const task = tasks.find((item) => item.id === project.nextActionTaskId);
  if (!task || deleted.has(task.id)) {
    return null;
  }
  return {
    id: task.id,
    title: task.title,
    dueDate: task.dueDate ?? null,
  };
};

const candidatesFor = (
  options: FakeReviewStoreOptions,
  organizationId: string
): ReviewCandidate[] => {
  const projects = options.projects ?? [];
  const tasks = options.tasks ?? [];
  const changeLog = options.changeLog ?? [];
  const deleted = new Set(options.deletedTaskIds ?? []);
  return projects
    .filter((project) => project.organizationId === organizationId)
    .filter((project) => project.status === 'active' || project.status === 'waiting')
    .map((project) => ({
      project,
      lastChangeAt: lastChangeAtFor(project, changeLog),
      nextAction: nextActionFor(project, tasks, deleted),
    }));
};

const compareFinished = (left: DoneListRow, right: DoneListRow): number => {
  if (left.task.completedAt > right.task.completedAt) {
    return -1;
  }
  if (left.task.completedAt < right.task.completedAt) {
    return 1;
  }
  if (left.task.id > right.task.id) {
    return -1;
  }
  if (left.task.id < right.task.id) {
    return 1;
  }
  return 0;
};

const nextActionForDone = (
  project: Project,
  tasks: readonly Task[],
  deleted: ReadonlySet<string>
): DoneListRow['nextAction'] => {
  if (project.nextActionTaskId === null) {
    return null;
  }
  const task = tasks.find((item) => item.id === project.nextActionTaskId);
  if (!task || deleted.has(task.id)) {
    return null;
  }
  return { id: task.id, title: task.title };
};

const doneRowsFor = (
  options: FakeReviewStoreOptions,
  page: PageDoneListOptions
): { rows: readonly DoneListRow[]; otherTaskCount: number } => {
  const projects = options.projects ?? [];
  const tasks = options.tasks ?? [];
  const deleted = new Set(options.deletedTaskIds ?? []);
  const inWeek = (task: Task): boolean =>
    typeof task.completedAt === 'string' &&
    task.completedAt >= page.completedAfter &&
    task.completedAt < page.completedBefore &&
    !deleted.has(task.id) &&
    task.organizationId === page.organizationId;

  const otherTaskCount = tasks.filter((task) => inWeek(task) && task.projectId === undefined)
    .length;

  const rows = tasks
    .filter((task) => inWeek(task) && task.projectId !== undefined)
    .flatMap((task): readonly DoneListRow[] => {
      const finished = asFinishedTaskOrNull(task);
      const owner = projects.find((project) => project.id === task.projectId);
      if (finished === null || owner === undefined) {
        return [];
      }
      return [
        {
          task: finished,
          project: owner,
          nextAction: nextActionForDone(owner, tasks, deleted),
        },
      ];
    })
    .toSorted(compareFinished);

  return { rows, otherTaskCount };
};

export const createFakeReviewStore = (
  options: FakeReviewStoreOptions = {}
): ReviewStore => {
  const fail = <T>(): ResultAsync<T, StorageError> =>
    errAsync(storageError('Review store failed'));

  return {
    pageReview: (page: PageReviewOptions) => {
      if (options.shouldFail) {
        return fail();
      }
      const ordered = buildReviewItems(candidatesFor(options, page.organizationId), {
        today: page.today,
        timeZone: page.timeZone,
      });
      return okAsync({
        ...pageOrdered({
          ordered,
          keysOf: reviewKeys,
          direction: reviewDirection,
          fetchLimit: page.fetchLimit,
          seek: page.seek,
        }),
        counts: countReviewReasons(ordered),
      });
    },

    loadTimeZone: (organizationId: string) => {
      if (options.shouldFail) {
        return fail();
      }
      return okAsync(options.timeZones?.[organizationId] ?? DEFAULT_VIEWER_TIME_ZONE);
    },

    pageDoneList: (page: PageDoneListOptions) => {
      if (options.shouldFail) {
        return fail();
      }
      const loaded = doneRowsFor(options, page);
      return okAsync({
        ...pageOrdered({
          ordered: loaded.rows,
          keysOf: (row) => doneListKeys(row.task),
          direction: doneListDirection,
          fetchLimit: page.fetchLimit,
          seek: page.seek,
        }),
        otherTaskCount: loaded.otherTaskCount,
      });
    },
  };
};
