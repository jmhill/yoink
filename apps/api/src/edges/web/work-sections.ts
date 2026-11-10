import type { NowNextActionItem, Task } from '@yoink/api-contracts';

export type ArrangedWorkRowSource = 'due' | 'next-action' | 'both';
export type ArrangedWorkSectionName = 'due' | 'next-actions';

export type ArrangedWorkRow = {
  readonly task: Task;
  readonly projectLabel?: string;
  readonly projectId?: string;
  readonly source: ArrangedWorkRowSource;
};

export type ArrangedWorkSection = {
  readonly name: ArrangedWorkSectionName;
  readonly rows: readonly ArrangedWorkRow[];
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

const nextActionRow = (
  item: NowNextActionItem,
  source: ArrangedWorkRowSource
): ArrangedWorkRow => ({
  task: item.task,
  projectLabel: item.project.name,
  projectId: item.project.id,
  source,
});

const dueListRow = (
  task: Task,
  nextActionById: ReadonlyMap<string, NowNextActionItem>
): ArrangedWorkRow => {
  const next = nextActionById.get(task.id);
  if (next === undefined) {
    return { task, source: 'due' };
  }
  return nextActionRow(next, 'both');
};

/**
 * Arrange the Now and due pages into Work sections.
 *
 * Task Management already ordered each page. This does not sort them again:
 * it does not compare keysets. Due is the due page's due rows, in that
 * page's order within overdue and within today, then due next actions the
 * due page left out, in next-action order within each of those groups.
 * A task that is in both pages is one Due row. Next actions that are due
 * are not repeated below. An empty group is omitted.
 */
export const arrangeWorkSections = (input: {
  readonly nextActions: readonly NowNextActionItem[];
  readonly dueTasks: readonly Task[];
  readonly today: string;
}): readonly ArrangedWorkSection[] => {
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
    .map((item) => nextActionRow(item, 'next-action'));

  const combined = [...fromDueList, ...fromNextActions];
  const dueRows = [
    ...combined.filter((row) => dueTimingOf(row.task.dueDate, input.today) === 'overdue'),
    ...combined.filter((row) => dueTimingOf(row.task.dueDate, input.today) === 'today'),
  ];

  const dueIds = new Set(dueRows.map((row) => row.task.id));
  const nextRows = input.nextActions
    .filter((item) => dueIds.has(item.task.id) === false)
    .map((item) => nextActionRow(item, 'next-action'));

  const dueSection: ArrangedWorkSection = { name: 'due', rows: dueRows };
  const nextSection: ArrangedWorkSection = { name: 'next-actions', rows: nextRows };
  return [dueSection, nextSection].filter((section) => section.rows.length > 0);
};

export type WorkMemberLabel = {
  readonly userId: string;
  readonly email: string;
  readonly name?: string;
  readonly kind: 'human' | 'agent';
};

/**
 * Same display rule as the work screen: hide the viewer and unowned rows.
 * An agent shows its name. A person shows their email.
 */
export const workOwnerLabel = (
  assigneeId: string | undefined,
  viewerId: string,
  members: readonly WorkMemberLabel[]
): string | undefined => {
  if (assigneeId === undefined || assigneeId === viewerId) {
    return undefined;
  }
  const member = members.find((item) => item.userId === assigneeId);
  if (member === undefined) {
    return undefined;
  }
  return member.kind === 'agent' ? (member.name ?? 'Agent') : member.email;
};
