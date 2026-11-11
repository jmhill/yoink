import type {
  HistoryPage as ContractHistoryPage,
  Task as ContractTask,
  TimelineDetails as ContractTimelineDetails,
  TimelineEntry as ContractTimelineEntry,
} from '@yoink/api-contracts';
import type { ListedPage } from '../../kernel/listing/domain/listed-page.js';
import type {
  HistoryPage,
  ListedTask,
  TimelineDetails,
  TimelineEntry,
} from '../../modules/history/index.js';

/**
 * Copy a timeline document onto the contract history page.
 * Key order matches the page the history query already returns.
 * Optional detail fields stay absent when the document omits them.
 */
const toContractTimelineDetails = (details: TimelineDetails): ContractTimelineDetails => {
  switch (details.kind) {
    case 'Unknown':
      return { kind: 'Unknown' };
    case 'TaskCreated':
      return {
        kind: 'TaskCreated',
        ...(details.via !== undefined ? { via: details.via } : {}),
        ...(details.projectName !== undefined ? { projectName: details.projectName } : {}),
      };
    case 'TaskUpdated':
      return {
        kind: 'TaskUpdated',
        ...(details.title !== undefined ? { title: details.title } : {}),
        ...(details.previousTitle !== undefined ? { previousTitle: details.previousTitle } : {}),
        ...(details.dueDate !== undefined ? { dueDate: details.dueDate } : {}),
        ...(details.assigneeId !== undefined ? { assigneeId: details.assigneeId } : {}),
        ...(details.listId !== undefined ? { listId: details.listId } : {}),
      };
    case 'TaskCompleted':
      return { kind: 'TaskCompleted' };
    case 'TaskUncompleted':
      return { kind: 'TaskUncompleted' };
    case 'TaskDeleted':
      return { kind: 'TaskDeleted' };
    case 'ProjectCreated':
      return {
        kind: 'ProjectCreated',
        name: details.name,
        ...(details.objective !== undefined ? { objective: details.objective } : {}),
        ...(details.status !== undefined ? { status: details.status } : {}),
        ...(details.captureId !== undefined ? { captureId: details.captureId } : {}),
      };
    case 'ProjectUpdated':
      return {
        kind: 'ProjectUpdated',
        ...(details.name !== undefined ? { name: details.name } : {}),
        ...(details.objective !== undefined ? { objective: details.objective } : {}),
        ...(details.notebookPages !== undefined ? { notebookPages: details.notebookPages } : {}),
      };
    case 'ProjectStatusChanged':
      return {
        kind: 'ProjectStatusChanged',
        from: details.from,
        to: details.to,
        ...(details.waitingOn !== undefined ? { waitingOn: details.waitingOn } : {}),
        ...(details.waitingSince !== undefined ? { waitingSince: details.waitingSince } : {}),
      };
    case 'ProjectWaitingChanged':
      return {
        kind: 'ProjectWaitingChanged',
        waitingOn: details.waitingOn,
        waitingSince: details.waitingSince,
      };
    case 'ProjectNextActionSet':
      return {
        kind: 'ProjectNextActionSet',
        taskId: details.taskId,
        taskTitle: details.taskTitle,
        previousTaskId: details.previousTaskId,
        previousTaskTitle: details.previousTaskTitle,
      };
    case 'ProjectNextActionCleared':
      return {
        kind: 'ProjectNextActionCleared',
        taskId: details.taskId,
        taskTitle: details.taskTitle,
        reason: details.reason,
      };
    case 'TaskAddedToProject':
      return {
        kind: 'TaskAddedToProject',
        projectId: details.projectId,
        ...(details.projectName !== undefined ? { projectName: details.projectName } : {}),
        ...(details.via !== undefined ? { via: details.via } : {}),
      };
    case 'TaskRemovedFromProject':
      return {
        kind: 'TaskRemovedFromProject',
        projectId: details.projectId,
        ...(details.toProjectName !== undefined ? { toProjectName: details.toProjectName } : {}),
      };
    case 'ProjectImported':
      return { kind: 'ProjectImported', taskCount: details.taskCount };
    case 'NoteCreated':
      return {
        kind: 'NoteCreated',
        title: details.title,
        ...(details.origin !== undefined ? { origin: details.origin } : {}),
      };
    case 'NoteUpdated':
      return {
        kind: 'NoteUpdated',
        title: details.title,
        titleChanged: details.titleChanged,
        bodyChanged: details.bodyChanged,
        ...(details.origin !== undefined ? { origin: details.origin } : {}),
      };
    case 'NoteDeleted':
      return { kind: 'NoteDeleted', title: details.title };
  }
};

const toContractTimelineEntry = (entry: TimelineEntry): ContractTimelineEntry => ({
  id: entry.id,
  kind: entry.kind,
  occurredAt: entry.occurredAt,
  actor: {
    userId: entry.actor.userId,
    kind: entry.actor.kind,
    name: entry.actor.name,
  },
  subject: {
    type: entry.subject.type,
    id: entry.subject.id,
    title: entry.subject.title,
    deleted: entry.subject.deleted,
  },
  details: toContractTimelineDetails(entry.details),
});

export const toContractHistoryPage = (page: HistoryPage): ContractHistoryPage => ({
  entries: page.entries.map(toContractTimelineEntry),
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
  historyStartsAt: page.historyStartsAt,
});

/** Copy a finished-task document onto the contract task, in the document's field order. */
export const toContractListedTask = (task: ListedTask): ContractTask => ({
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

export const toHistoryTaskListBody = (page: ListedPage<ListedTask>) => ({
  tasks: page.items.map(toContractListedTask),
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});
