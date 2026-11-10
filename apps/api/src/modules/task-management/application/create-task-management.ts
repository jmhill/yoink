import type { UnitOfWork } from '../../../kernel/unit-of-work.js';
import type { CommandLogger } from '../../../kernel/command-log.js';
import { storageError } from '../domain/messages/storage-error.js';
import type { OrgPrincipalLookup } from '../domain/model/org-principal-lookup.js';
import { createListHandlers, type ListHandlers } from './create-list-handlers.js';
import { createProjectHandlers, type ProjectHandlers } from './create-project-handlers.js';
import { createTaskHandlers, type TaskHandlers } from './create-task-handlers.js';
import { createWorkHandlers, type WorkHandlers } from './create-work-handlers.js';
import type { ListHandlerDeps } from './create-list-handlers.js';
import type { ProjectHandlerDeps } from './create-project-handlers.js';
import type { TaskHandlerDeps } from './create-task-handlers.js';
import type { WorkHandlerDeps } from './create-work-handlers.js';
import {
  createUowImportDiscard,
  createUowImportPersist,
  createUowListPersist,
  createUowProjectPersist,
  createUowProjectStatusPersist,
  createUowTaskPersist,
} from './support/commit-task-management.js';
import {
  prepareCreateProject,
  prepareCreateTask,
  type PrepareCreateDeps,
  type ProjectStarter,
  type TaskStarter,
} from './prepare-starters.js';

export type { ProjectStarter, TaskStarter };

type Shared = {
  uow: UnitOfWork;
  logger: CommandLogger;
  nextId: () => string;
  now: () => string;
  principalLookup: OrgPrincipalLookup;
};

export type CreateTaskManagementDeps = Shared &
  Omit<ListHandlerDeps, 'persist' | 'logger' | 'nextId' | 'now' | 'load' | 'list' | 'loadTasksByIds'> &
  Omit<
    ProjectHandlerDeps,
    | 'persist'
    | 'persistStatus'
    | 'persistSetNextAction'
    | 'persistApply'
    | 'persistDiscard'
    | 'logger'
    | 'nextId'
    | 'now'
    | 'principalLookup'
    | 'load'
    | 'loadList'
    | 'loadTask'
    | 'list'
  > &
  Omit<TaskHandlerDeps, 'persist' | 'logger' | 'nextId' | 'now' | 'principalLookup' | 'load' | 'loadList'> &
  Omit<WorkHandlerDeps, 'now'> & {
    listNamedLists: ListHandlerDeps['list'];
    loadNamedList: ListHandlerDeps['load'];
    listProjects: ProjectHandlerDeps['list'];
    loadProject: ProjectHandlerDeps['load'];
    loadTask: TaskHandlerDeps['load'];
    loadListTasksByIds: ListHandlerDeps['loadTasksByIds'];
  };

export const createTaskManagement = (deps: CreateTaskManagementDeps) => {
  const prepares: PrepareCreateDeps = {
    listProjects: deps.listProjects,
    loadNamedList: deps.loadNamedList,
    loadProject: deps.loadProject,
    loadNextOpenOrder: deps.loadNextOpenOrder,
    principalLookup: deps.principalLookup,
    nextId: deps.nextId,
    now: deps.now,
  };
  const persistBatch = createUowProjectStatusPersist(deps.uow);
  const listHandlers: ListHandlers = createListHandlers({
    persist: createUowListPersist(deps.uow),
    list: deps.listNamedLists,
    pageNamedLists: deps.pageNamedLists,
    load: deps.loadNamedList,
    countOpenOnList: deps.countOpenOnList,
    loadOpenTasksOnList: deps.loadOpenTasksOnList,
    pageOpenTasksOnList: deps.pageOpenTasksOnList,
    loadTasksByIds: deps.loadListTasksByIds,
    nextId: deps.nextId,
    now: deps.now,
    logger: deps.logger,
  });
  const projectHandlers: ProjectHandlers = createProjectHandlers({
    persist: createUowProjectPersist(deps.uow),
    persistStatus: (input) =>
      persistBatch(input).mapErr((error) =>
        error.type === 'PROJECT_DONE' ? storageError(error.message) : error
      ),
    persistSetNextAction: persistBatch,
    persistStage: deps.persistStage,
    persistApply: createUowImportPersist(deps.uow),
    persistDiscard: createUowImportDiscard(deps.uow),
    loadImport: deps.loadImport,
    listPendingImports: deps.listPendingImports,
    loadTasksByIds: deps.loadTasksByIds,
    loadListsByIds: deps.loadListsByIds,
    loadMemberIds: deps.loadMemberIds,
    loadUserName: deps.loadUserName,
    list: deps.listProjects,
    pageProjects: deps.pageProjects,
    load: deps.loadProject,
    loadTask: deps.loadTask,
    loadList: (id) =>
      deps.loadNamedList(id).map((list) =>
        list === null ? null : { id: list.id, organizationId: list.organizationId }
      ),
    loadNextOpenOrder: deps.loadNextOpenOrder,
    pageOpenTasksOnProject: deps.pageOpenTasksOnProject,
    principalLookup: deps.principalLookup,
    nextId: deps.nextId,
    now: deps.now,
    logger: deps.logger,
  });
  const taskHandlers: TaskHandlers = createTaskHandlers({
    persist: createUowTaskPersist(deps.uow),
    load: deps.loadTask,
    loadList: deps.loadNamedList,
    loadProject: deps.loadProject,
    loadNextOpenOrder: deps.loadNextOpenOrder,
    loadOpenInPile: deps.loadOpenInPile,
    list: deps.list,
    viewerNow: deps.viewerNow,
    principalLookup: deps.principalLookup,
    nextId: deps.nextId,
    now: deps.now,
    logger: deps.logger,
  });
  const workHandlers: WorkHandlers = createWorkHandlers({
    pageNextActions: deps.pageNextActions,
    pageDue: deps.pageDue,
    pageLists: deps.pageLists,
    countUnlistedOpen: deps.countUnlistedOpen,
    now: deps.viewerNow,
  });

  return {
    commands: {
      createTask: taskHandlers.create,
      updateTask: taskHandlers.update,
      completeTask: taskHandlers.complete,
      uncompleteTask: taskHandlers.uncomplete,
      pinTask: taskHandlers.pin,
      unpinTask: taskHandlers.unpin,
      deleteTask: taskHandlers.delete,
      createProject: projectHandlers.create,
      updateProject: projectHandlers.update,
      changeProjectStatus: projectHandlers.changeStatus,
      setProjectNextAction: projectHandlers.setNextAction,
      confirmProposal: projectHandlers.confirmProposal,
      declineProposal: projectHandlers.declineProposal,
      restoreProposal: projectHandlers.restoreProposal,
      stageImport: projectHandlers.stageImport,
      applyImport: projectHandlers.applyImport,
      discardImport: projectHandlers.discardImport,
      createNamedList: listHandlers.create,
      renameNamedList: listHandlers.rename,
      deleteNamedList: listHandlers.delete,
      reorderOpenTasks: listHandlers.reorderOpenTasks,
      reorderUnlistedOpenTasks: listHandlers.reorderUnlistedOpenTasks,
    },
    queries: {
      listTasks: taskHandlers.list,
      listProjects: projectHandlers.list,
      getProject: projectHandlers.get,
      listOpenTasksOnProject: projectHandlers.listOpenTasks,
      listImports: projectHandlers.listImports,
      getImport: projectHandlers.getImport,
      listNamedLists: listHandlers.list,
      listOpenTasksOnList: listHandlers.listOpenTasks,
      listUnlistedOpenTasks: listHandlers.listUnlistedOpenTasks,
      listNowNextActions: workHandlers.listNextActions,
      listNowDue: workHandlers.listDue,
      listWorkLists: workHandlers.listLists,
    },
    prepare: {
      createTask: (starter: TaskStarter, actor: Parameters<typeof prepareCreateTask>[1]) =>
        prepareCreateTask(starter, actor, prepares),
      createProject: (starter: ProjectStarter, actor: Parameters<typeof prepareCreateProject>[1]) =>
        prepareCreateProject(starter, actor, prepares),
    },
    taskHandlers,
    projectHandlers,
    listHandlers,
    workHandlers,
  };
};

export type TaskManagement = ReturnType<typeof createTaskManagement>;
