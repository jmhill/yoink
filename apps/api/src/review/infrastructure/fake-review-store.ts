import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import { pageOrdered } from '../../listing/domain/keyset-window.js';
import { reviewDirection, reviewKeys } from '../../listing/domain/list-keys.js';
import {
  buildReviewItems,
  latestIsoInstant,
  type ReviewCandidate,
} from '../domain/build-review.js';
import { countReviewReasons } from '../domain/review-order.js';
import { storageError, type StorageError } from '../domain/review-errors.js';
import type {
  PageReviewOptions,
  ReviewChangeLogEntry,
  ReviewStore,
} from '../domain/review-store.js';

export type FakeReviewStoreOptions = {
  projects?: Project[];
  tasks?: Task[];
  changeLog?: ReviewChangeLogEntry[];
  deletedTaskIds?: readonly string[];
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
  };
};
