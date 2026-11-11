import type {
  AppliedImport as ContractAppliedImport,
  DiscardedImport as ContractDiscardedImport,
  NamedList as ContractNamedList,
  NowNextActionItem as ContractNowNextActionItem,
  Project as ContractProject,
  StagedImport as ContractStagedImport,
  Task as ContractTask,
} from '@yoink/api-contracts';
import type { ListedPage } from '../../kernel/listing/domain/listed-page.js';
import type {
  AppliedImport,
  DiscardedImport,
  NamedList,
  NowNextActionItem,
  Project,
  StagedImport,
  Task,
} from '../../modules/task-management/index.js';

/**
 * Copy a task document onto the contract task.
 * Optional fields stay absent when the document omits them. Field order matches
 * the row parser, so a mapped task keeps the JSON key order the module returns.
 */
export const toContractTask = (task: Task): ContractTask => ({
  id: task.id,
  organizationId: task.organizationId,
  createdById: task.createdById,
  title: task.title,
  createdAt: task.createdAt,
  lastChangedAt: task.lastChangedAt,
  lastChangedBy: task.lastChangedBy,
  completedBy: task.completedBy,
  ...(task.captureId !== undefined ? { captureId: task.captureId } : {}),
  ...(task.dueDate !== undefined ? { dueDate: task.dueDate } : {}),
  ...(task.completedAt !== undefined ? { completedAt: task.completedAt } : {}),
  ...(task.pinnedAt !== undefined ? { pinnedAt: task.pinnedAt } : {}),
  ...(task.assigneeId !== undefined ? { assigneeId: task.assigneeId } : {}),
  ...(task.listId !== undefined ? { listId: task.listId } : {}),
  ...(task.projectId !== undefined ? { projectId: task.projectId } : {}),
  ...(task.openOrder !== undefined ? { openOrder: task.openOrder } : {}),
  ...(task.completedByName !== undefined ? { completedByName: task.completedByName } : {}),
});

export const toContractTaskPage = <T extends ListedPage<Task>>(page: T): Omit<T, 'items'> & { items: ContractTask[] } => ({
  ...page,
  items: page.items.map(toContractTask),
});

export const toContractNamedList = (list: NamedList): ContractNamedList => ({
  id: list.id,
  organizationId: list.organizationId,
  createdById: list.createdById,
  name: list.name,
  createdAt: list.createdAt,
});

export const toContractNamedListPage = <T extends ListedPage<NamedList>>(
  page: T
): Omit<T, 'items'> & { items: ContractNamedList[] } => ({
  ...page,
  items: page.items.map(toContractNamedList),
});

export const toContractProject = (project: Project): ContractProject => ({
  id: project.id,
  organizationId: project.organizationId,
  createdById: project.createdById,
  name: project.name,
  status: project.status,
  waitingOn: project.waitingOn,
  waitingSince: project.waitingSince,
  nextActionTaskId: project.nextActionTaskId,
  notebookPages: project.notebookPages.map((page) => ({ path: page.path, url: page.url })),
  createdAt: project.createdAt,
  lastChangedAt: project.lastChangedAt,
  lastChangedBy: project.lastChangedBy,
  ...(project.objective !== undefined ? { objective: project.objective } : {}),
  ...(project.reason !== undefined ? { reason: project.reason } : {}),
  ...(project.suggestedNextAction !== undefined
    ? { suggestedNextAction: project.suggestedNextAction }
    : {}),
});

export const toContractProjectPage = <T extends ListedPage<Project>>(
  page: T
): Omit<T, 'items'> & { items: ContractProject[] } => ({
  ...page,
  items: page.items.map(toContractProject),
});

export const toContractNowNextActionItem = (item: NowNextActionItem): ContractNowNextActionItem => ({
  task: toContractTask(item.task),
  project: { id: item.project.id, name: item.project.name },
});

export const toContractNowNextActionPage = <T extends ListedPage<NowNextActionItem>>(
  page: T
): Omit<T, 'items'> & { items: ContractNowNextActionItem[] } => ({
  ...page,
  items: page.items.map(toContractNowNextActionItem),
});

const toContractImportError = (error: StagedImport['errors'][number]) => ({
  index: error.index,
  name: error.name,
  field: error.field,
  code: error.code,
  message: error.message,
  ...(error.taskTitle !== undefined ? { taskTitle: error.taskTitle } : {}),
});

export const toContractStagedImport = (view: StagedImport): ContractStagedImport => ({
  id: view.id,
  status: view.status,
  createdById: view.createdById,
  createdByName: view.createdByName,
  createdAt: view.createdAt,
  decidedById: view.decidedById,
  decidedAt: view.decidedAt,
  preview: view.preview,
  errors: view.errors.map(toContractImportError),
});

export const toContractAppliedImport = (view: AppliedImport): ContractAppliedImport => ({
  id: view.id,
  status: view.status,
  preview: view.preview,
  projects: view.projects.map(toContractProject),
});

export const toContractDiscardedImport = (view: DiscardedImport): ContractDiscardedImport => ({
  id: view.id,
  status: view.status,
  decidedById: view.decidedById,
  decidedAt: view.decidedAt,
});
