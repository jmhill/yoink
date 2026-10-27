import type { NowNextActionItem, Task } from '@yoink/api-contracts';

export type WorkScreenSectionName = 'due' | 'next-actions';

export type WorkScreenRow = {
  readonly task: Task;
  readonly projectLabel?: string;
};

export type WorkScreenSection = {
  readonly name: WorkScreenSectionName;
  readonly rows: readonly WorkScreenRow[];
};

type DueTiming = 'overdue' | 'today' | 'later';

/**
 * Calendar day of a due date relative to the viewer today (YYYY-MM-DD).
 * Missing and future dates are not due.
 */
const dueTimingOf = (dueDate: string | undefined, today: string): DueTiming => {
  if (dueDate === undefined || dueDate > today) {
    return 'later';
  }
  if (dueDate < today) {
    return 'overdue';
  }
  return 'today';
};

const countsAsDue = (timing: DueTiming): boolean => {
  switch (timing) {
    case 'overdue':
    case 'today':
      return true;
    case 'later':
      return false;
    default: {
      const unexpected: never = timing;
      return unexpected;
    }
  }
};

const nextActionRow = (item: NowNextActionItem): WorkScreenRow => ({
  task: item.task,
  projectLabel: item.project.name,
});

const dueListRow = (
  task: Task,
  nextActionById: ReadonlyMap<string, NowNextActionItem>
): WorkScreenRow => {
  const next = nextActionById.get(task.id);
  if (next === undefined) {
    return { task };
  }
  return nextActionRow(next);
};

/**
 * Work groups for the screen.
 *
 * Due is first. Overdue rows come before rows due today. Within each of
 * those, the due-list order is kept, then due next actions that the due
 * list left out, in next-action order. A task that is in both lists is
 * one Due row. Next actions that are due are not repeated below. An empty
 * group is omitted.
 */
export const workScreenSections = (input: {
  readonly nextActions: readonly NowNextActionItem[];
  readonly dueTasks: readonly Task[];
  readonly today: string;
}): readonly WorkScreenSection[] => {
  const nextActionById = new Map(
    input.nextActions.map((item): [string, NowNextActionItem] => [item.task.id, item])
  );
  const dueListIds = new Set(input.dueTasks.map((task) => task.id));

  const fromDueList = input.dueTasks
    .filter((task) => countsAsDue(dueTimingOf(task.dueDate, input.today)))
    .map((task) => dueListRow(task, nextActionById));

  const fromNextActions = input.nextActions
    .filter(
      (item) =>
        dueListIds.has(item.task.id) === false &&
        countsAsDue(dueTimingOf(item.task.dueDate, input.today))
    )
    .map(nextActionRow);

  const combined = [...fromDueList, ...fromNextActions];
  const dueRows = [
    ...combined.filter((row) => dueTimingOf(row.task.dueDate, input.today) === 'overdue'),
    ...combined.filter((row) => dueTimingOf(row.task.dueDate, input.today) === 'today'),
  ];

  const dueIds = new Set(dueRows.map((row) => row.task.id));
  const nextRows = input.nextActions
    .filter((item) => dueIds.has(item.task.id) === false)
    .map(nextActionRow);

  const dueSection: WorkScreenSection = { name: 'due', rows: dueRows };
  const nextSection: WorkScreenSection = { name: 'next-actions', rows: nextRows };
  return [dueSection, nextSection].filter((section) => section.rows.length > 0);
};

export const workScreenSectionCopy = (
  name: WorkScreenSectionName
): { readonly title: string; readonly emptyMessage: string } => {
  switch (name) {
    case 'due':
      return { title: 'Due', emptyMessage: 'Nothing due' };
    case 'next-actions':
      return { title: 'Next actions', emptyMessage: 'No next actions' };
    default: {
      const unexpected: never = name;
      return unexpected;
    }
  }
};
