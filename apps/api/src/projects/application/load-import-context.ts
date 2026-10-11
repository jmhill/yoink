import { ResultAsync } from 'neverthrow';
import type { ImportProject } from '@yoink/api-contracts';
import type { StorageError } from '../domain/project-errors.js';
import type { DecideImportInput } from '../domain/decide-import.js';
import type {
  ListProjects,
  LoadListsByIds,
  LoadMemberIds,
  LoadNextOpenOrder,
  LoadTasksByIds,
} from './ports.js';
import type { Actor } from '../../shared/auth-context.js';

export type LoadImportContextDeps = {
  list: ListProjects;
  loadTasksByIds: LoadTasksByIds;
  loadListsByIds: LoadListsByIds;
  loadMemberIds: LoadMemberIds;
  loadNextOpenOrder: LoadNextOpenOrder;
  nextId: () => string;
  now: () => string;
};

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

export const collectReferencedIds = (projects: readonly ImportProject[]) => {
  const taskIds: string[] = [];
  const listIds: string[] = [];
  for (const entry of projects) {
    for (const id of entry.existingTaskIds ?? []) {
      taskIds.push(id);
    }
    for (const task of entry.newTasks ?? []) {
      if (task.listId) {
        listIds.push(task.listId);
      }
    }
  }
  return { taskIds: unique(taskIds), listIds: unique(listIds) };
};

export const loadImportContext = (
  input: {
    projects: readonly ImportProject[];
    organizationId: string;
    createdById: string;
    actor: Actor;
  },
  deps: LoadImportContextDeps
): ResultAsync<DecideImportInput, StorageError> => {
  const refs = collectReferencedIds(input.projects);
  const listIds = refs.listIds;

  return deps.list(input.organizationId).andThen((existing) =>
    deps.loadTasksByIds(refs.taskIds).andThen((tasks) =>
      deps.loadListsByIds(listIds).andThen((lists) =>
        deps.loadMemberIds(input.organizationId).andThen((memberIds) => {
          const destLists = unique([...listIds, '']);
          return ResultAsync.combine(
            destLists.map((listId) =>
              deps
                .loadNextOpenOrder(input.organizationId, listId === '' ? null : listId)
                .map((order) => [listId, order] as const)
            )
          )
            .map((entries) => new Map(entries))
            .map((nextOpenOrderByListId) => ({
              projects: input.projects,
              organizationId: input.organizationId,
              createdById: input.createdById,
              existingProjectNames: existing.map((project) => project.name),
              tasksById: new Map(tasks.map((task) => [task.id, task])),
              listsById: new Map(lists.map((list) => [list.id, list])),
              memberIds,
              nextOpenOrderByListId,
              actor: input.actor,
              now: deps.now(),
              nextId: deps.nextId,
            }));
        })
      )
    )
  );
};
