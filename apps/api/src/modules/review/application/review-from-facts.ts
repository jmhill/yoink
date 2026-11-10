import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import { DEFAULT_VIEWER_TIME_ZONE } from '../../../kernel/viewer-today.js';
import { pageOrdered } from '../../../kernel/listing/domain/keyset-window.js';
import type { KeysetCursor } from '../../../kernel/listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../../kernel/listing/domain/listed-page.js';
import { reviewDirection, reviewKeys } from '../../../kernel/listing/domain/list-keys.js';
import { buildReviewItems, latestIsoInstant, type ReviewCandidate } from '../domain/build-review.js';
import { asFinishedTaskOrNull, type DoneListRow } from '../domain/group-done.js';
import { countReviewReasons } from '../domain/review-order.js';
import { storageError, type StorageError } from '../domain/review-errors.js';
import type {
  PageDoneListOptions,
  PageReviewOptions,
  ReviewStore,
} from '../domain/review-store.js';

export type ProjectChangeFact = {
  readonly projectId: string;
  readonly occurredAt: string;
};

export type FinishedOnProjectPage = {
  organizationId: string;
  completedAfter: string;
  completedBefore: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type FinishedWithoutProjectCount = {
  organizationId: string;
  completedAfter: string;
  completedBefore: string;
};

export type ReviewFactDeps = {
  listProjects: (organizationId: string) => ResultAsync<readonly Project[], StorageError>;
  listTasks: (ids: readonly string[]) => ResultAsync<readonly Task[], StorageError>;
  pageFinishedOnProject: (
    options: FinishedOnProjectPage
  ) => ResultAsync<KeysetRows<Task>, StorageError>;
  countFinishedWithoutProject: (
    options: FinishedWithoutProjectCount
  ) => ResultAsync<number, StorageError>;
  latestProjectChanges: (
    organizationId: string
  ) => ResultAsync<readonly ProjectChangeFact[], StorageError>;
  loadTimeZone: (organizationId: string) => ResultAsync<string | null, StorageError>;
};

const attentionStatuses = new Set<Project['status']>(['active', 'waiting']);

export const reviewCandidatesFromFacts = (input: {
  organizationId: string;
  projects: readonly Project[];
  tasks: readonly Task[];
  changes: readonly ProjectChangeFact[];
}): ReviewCandidate[] => {
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const changeAt = new Map(input.changes.map((change) => [change.projectId, change.occurredAt]));
  return input.projects
    .filter((project) => project.organizationId === input.organizationId)
    .filter((project) => attentionStatuses.has(project.status))
    .map((project) => {
      const next =
        project.nextActionTaskId === null
          ? undefined
          : tasksById.get(project.nextActionTaskId);
      const nextAction =
        next && next.organizationId === project.organizationId
          ? { id: next.id, title: next.title, dueDate: next.dueDate ?? null }
          : null;
      return {
        project,
        lastChangeAt:
          latestIsoInstant([
            project.lastChangedAt,
            project.createdAt,
            changeAt.get(project.id),
          ]) ?? project.createdAt,
        nextAction,
      };
    });
};

export const doneRowsInOrder = (input: {
  tasks: readonly Task[];
  projects: readonly Project[];
  nextActions: readonly Task[];
}): DoneListRow[] => {
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const tasksById = new Map(input.nextActions.map((task) => [task.id, task]));
  return input.tasks.flatMap((task) => {
    const finished = asFinishedTaskOrNull(task);
    const project =
      typeof task.projectId === 'string' ? projectsById.get(task.projectId) : undefined;
    if (finished === null || project === undefined) {
      return [];
    }
    const next =
      project.nextActionTaskId === null ? undefined : tasksById.get(project.nextActionTaskId);
    return [
      {
        task: finished,
        project,
        nextAction:
          next && next.organizationId === project.organizationId
            ? { id: next.id, title: next.title }
            : null,
      },
    ];
  });
};

const taskIds = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.filter((id): id is string => id !== null && id.length > 0)),
];

export const createReviewFromFacts = (deps: ReviewFactDeps): ReviewStore => ({
  pageReview: (options: PageReviewOptions) =>
    deps.listProjects(options.organizationId).andThen((projects) => {
      const attention = projects.filter(
        (project) =>
          project.organizationId === options.organizationId && attentionStatuses.has(project.status)
      );
      return deps
        .listTasks(taskIds(attention.map((project) => project.nextActionTaskId)))
        .andThen((tasks) =>
          deps.latestProjectChanges(options.organizationId).map((changes) => {
            const ordered = buildReviewItems(
              reviewCandidatesFromFacts({
                organizationId: options.organizationId,
                projects: attention,
                tasks,
                changes,
              }),
              { today: options.today, timeZone: options.timeZone }
            );
            return {
              ...pageOrdered({
                ordered,
                keysOf: reviewKeys,
                direction: reviewDirection,
                fetchLimit: options.fetchLimit,
                seek: options.seek,
              }),
              counts: countReviewReasons(ordered),
            };
          })
        );
    }),

  loadTimeZone: (organizationId: string) =>
    deps.loadTimeZone(organizationId).andThen((zone) => {
      if (zone === null) {
        return errAsync(storageError('Organization not found', { organizationId }));
      }
      if (zone.length === 0) {
        return okAsync(DEFAULT_VIEWER_TIME_ZONE);
      }
      return okAsync(zone);
    }),

  pageDoneList: (options: PageDoneListOptions) =>
    deps
      .pageFinishedOnProject({
        organizationId: options.organizationId,
        completedAfter: options.completedAfter,
        completedBefore: options.completedBefore,
        fetchLimit: options.fetchLimit,
        seek: options.seek,
      })
      .andThen((page) =>
        deps
          .countFinishedWithoutProject({
            organizationId: options.organizationId,
            completedAfter: options.completedAfter,
            completedBefore: options.completedBefore,
          })
          .andThen((otherTaskCount) =>
            deps.listProjects(options.organizationId).andThen((projects) => {
              const onPage = new Set(
                page.rows.flatMap((task) => (task.projectId ? [task.projectId] : []))
              );
              const owners = projects.filter((project) => onPage.has(project.id));
              return deps
                .listTasks(taskIds(owners.map((project) => project.nextActionTaskId)))
                .map((nextActions) => ({
                  rows: doneRowsInOrder({ tasks: page.rows, projects: owners, nextActions }),
                  total: page.total,
                  otherTaskCount,
                }));
            })
          )
      ),
});
