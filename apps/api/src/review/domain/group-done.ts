import type { Project, Task } from '@yoink/api-contracts';
import type { FinishedTask } from '../../listing/domain/list-keys.js';

export type DoneListNextAction = {
  readonly id: string;
  readonly title: string;
};

export type DoneListRow = {
  readonly task: FinishedTask;
  readonly project: Project;
  readonly nextAction: DoneListNextAction | null;
};

export type DoneListGroup = {
  readonly project: Project;
  readonly nextAction: DoneListNextAction | null;
  readonly tasks: readonly FinishedTask[];
};

export const asFinishedTaskOrNull = (task: Task): FinishedTask | null => {
  if (typeof task.completedAt !== 'string' || task.completedAt.length === 0) {
    return null;
  }
  return { ...task, completedAt: task.completedAt };
};

/**
 * Group finished project tasks. Callers pass newest-first rows; the first
 * time a project appears is its group order (most recent finish first).
 * Tasks inside a group stay newest first. Project-less rows are ignored.
 */
export const groupDoneRows = (rows: readonly DoneListRow[]): readonly DoneListGroup[] =>
  rows.reduce<readonly DoneListGroup[]>((groups, row) => {
    const existing = groups.find((group) => group.project.id === row.project.id);
    if (existing === undefined) {
      return [
        ...groups,
        {
          project: row.project,
          nextAction: row.nextAction,
          tasks: [row.task],
        },
      ];
    }
    return groups.map((group) =>
      group.project.id === row.project.id
        ? { ...group, tasks: [...group.tasks, row.task] }
        : group
    );
  }, []);
