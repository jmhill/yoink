import type {
  DoneListPage as ContractDoneListPage,
  Project as ContractProject,
  ReviewCounts as ContractReviewCounts,
  ReviewPage as ContractReviewPage,
  ReviewProject as ContractReviewProject,
  Task as ContractTask,
} from '@yoink/api-contracts';
import type { ListedPage } from '../../kernel/listing/domain/listed-page.js';
import type {
  RankedReviewProject,
  ReviewCounts,
  ReviewDonePage,
  ReviewNextAction,
  ReviewProjectDocument,
  ReviewTaskDocument,
} from '../../modules/review/index.js';

/**
 * Copy a review document onto the contract review page and done page.
 * Project and task field order matches the row parsers, so a mapped row
 * keeps the JSON key order the module returns. Optional fields stay absent
 * when the document omits them. The public API and the web edge both use
 * this copy. Neither sorts the page. Review has no HTTP command.
 */
const toContractProject = (project: ReviewProjectDocument): ContractProject => ({
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

const toContractTask = (task: ReviewTaskDocument): ContractTask => ({
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

const toContractNextAction = (
  nextAction: ReviewNextAction | null
): ContractReviewProject['nextAction'] =>
  nextAction === null
    ? null
    : { id: nextAction.id, title: nextAction.title, dueDate: nextAction.dueDate };

const toContractReviewProject = (item: RankedReviewProject): ContractReviewProject => ({
  project: toContractProject(item.project),
  reasons: [...item.reasons],
  lastChangeAt: item.lastChangeAt,
  daysSinceChange: item.daysSinceChange,
  daysWaiting: item.daysWaiting,
  nextAction: toContractNextAction(item.nextAction),
});

const toContractCounts = (counts: ReviewCounts): ContractReviewCounts => ({
  noNextAction: counts.noNextAction,
  quiet: counts.quiet,
  waiting: counts.waiting,
});

export const toContractReviewPage = (
  page: ListedPage<RankedReviewProject> & { today: string; counts: ReviewCounts }
): ContractReviewPage => ({
  projects: page.items.map(toContractReviewProject),
  today: page.today,
  counts: toContractCounts(page.counts),
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const toContractDonePage = (page: ReviewDonePage): ContractDoneListPage => ({
  timeZone: page.timeZone,
  week: { start: page.week.start, end: page.week.end },
  previousWeek: page.previousWeek,
  nextWeek: page.nextWeek,
  groups: page.groups.map((group) => ({
    project: toContractProject(group.project),
    nextAction:
      group.nextAction === null
        ? null
        : { id: group.nextAction.id, title: group.nextAction.title },
    tasks: group.tasks.map(toContractTask),
  })),
  otherTaskCount: page.otherTaskCount,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});
