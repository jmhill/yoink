import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { NamedList, NowNextActionItem, Project, Task } from '@yoink/api-contracts';
import { pageOrdered } from '../../listing/domain/keyset-window.js';
import {
  workDueDirection,
  workDueKeys,
  workListDirection,
  workListKeys,
  workNextActionDirection,
  workNextActionKeys,
} from '../../listing/domain/list-keys.js';
import { compareNowDue, compareNowNextActions, compareWorkLists } from '../domain/now-order.js';
import { storageError, type StorageError } from '../domain/work-errors.js';
import type {
  PageNowDueOptions,
  PageNowNextActionsOptions,
  PageWorkListsOptions,
  WorkListsPageRows,
  WorkStore,
} from '../domain/work-store.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';

export type FakeWorkStoreOptions = {
  tasks?: Task[];
  projects?: Project[];
  lists?: NamedList[];
  deletedTaskIds?: readonly string[];
  shouldFail?: boolean;
};

const isShownNextAction = (
  task: Task,
  projects: readonly Project[],
  deleted: ReadonlySet<string>
): boolean => {
  if (task.completedAt || deleted.has(task.id)) {
    return false;
  }
  return projects.some(
    (project) =>
      project.status === 'active' &&
      project.nextActionTaskId === task.id &&
      project.organizationId === task.organizationId
  );
};

const matchesOwner = (
  assigneeId: string | undefined,
  owner: PageNowNextActionsOptions['owner'],
  callerId: string
): boolean => owner === 'all' || assigneeId === callerId;

export const createFakeWorkStore = (options: FakeWorkStoreOptions = {}): WorkStore => {
  const tasks = [...(options.tasks ?? [])];
  const projects = [...(options.projects ?? [])];
  const lists = [...(options.lists ?? [])];
  const deleted = new Set(options.deletedTaskIds ?? []);

  const fail = <T>(): ResultAsync<T, StorageError> =>
    errAsync(storageError('Work store failed'));

  return {
    pageNextActions: (
      page: PageNowNextActionsOptions
    ): ResultAsync<KeysetRows<NowNextActionItem>, StorageError> => {
      if (options.shouldFail) {
        return fail();
      }
      const rows = projects
        .filter((project) => project.organizationId === page.organizationId)
        .filter((project) => project.status === 'active')
        .flatMap((project) => {
          const task = tasks.find((item) => item.id === project.nextActionTaskId);
          if (!task || task.completedAt || deleted.has(task.id)) {
            return [];
          }
          if (task.organizationId !== page.organizationId) {
            return [];
          }
          if (!matchesOwner(task.assigneeId, page.owner, page.callerId)) {
            return [];
          }
          return [{ task, project: { id: project.id, name: project.name } }];
        })
        .sort(compareNowNextActions);
      return okAsync(
        pageOrdered({
          ordered: rows,
          keysOf: workNextActionKeys,
          direction: workNextActionDirection,
          fetchLimit: page.fetchLimit,
          seek: page.seek,
        })
      );
    },

    pageDue: (page: PageNowDueOptions): ResultAsync<KeysetRows<Task>, StorageError> => {
      if (options.shouldFail) {
        return fail();
      }
      const rows = tasks
        .filter((task) => task.organizationId === page.organizationId)
        .filter((task) => !deleted.has(task.id))
        .filter((task) => !task.completedAt)
        .filter((task) => typeof task.dueDate === 'string' && task.dueDate <= page.today)
        .filter((task) => !isShownNextAction(task, projects, deleted))
        .filter((task) => matchesOwner(task.assigneeId, page.owner, page.callerId))
        .sort(compareNowDue);
      return okAsync(
        pageOrdered({
          ordered: rows,
          keysOf: workDueKeys,
          direction: workDueDirection,
          fetchLimit: page.fetchLimit,
          seek: page.seek,
        })
      );
    },

    pageLists: (page: PageWorkListsOptions): ResultAsync<WorkListsPageRows, StorageError> => {
      if (options.shouldFail) {
        return fail();
      }
      const open = tasks.filter(
        (task) =>
          task.organizationId === page.organizationId &&
          !task.completedAt &&
          !deleted.has(task.id)
      );
      const rows = lists
        .filter((list) => list.organizationId === page.organizationId)
        .map((list) => ({
          id: list.id,
          name: list.name,
          createdAt: list.createdAt,
          openTaskCount: open.filter((task) => task.listId === list.id).length,
        }))
        .sort(compareWorkLists);
      return okAsync({
        lists: pageOrdered({
          ordered: rows,
          keysOf: workListKeys,
          direction: workListDirection,
          fetchLimit: page.fetchLimit,
          seek: page.seek,
        }),
        unlistedOpenCount: open.filter((task) => task.listId === undefined).length,
      });
    },
  };
};
