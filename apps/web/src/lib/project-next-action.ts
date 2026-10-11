import type { Project, ProjectStatus } from '@yoink/api-contracts';

const WARNING_STATUSES: ReadonlySet<ProjectStatus> = new Set(['active', 'waiting']);

/**
 * The dashed amber "no next action" card / list label / rail dot.
 * Active and waiting only. Someday may have a next action but never warns.
 * Done cannot have a next action.
 */
export const showsNoNextActionWarning = (
  project: Pick<Project, 'status' | 'nextActionTaskId'>
): boolean => WARNING_STATUSES.has(project.status) && project.nextActionTaskId === null;

/**
 * Someday may have a next action but never warns. With none, show a plain
 * Set next action link instead of the amber card.
 */
export const showsSomedaySetNextAction = (
  project: Pick<Project, 'status' | 'nextActionTaskId'>
): boolean => project.status === 'someday' && project.nextActionTaskId === null;
