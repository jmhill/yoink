import type { Task } from '@yoink/api-contracts';

export const ALL_PILE_OVERVIEW = 'overview';
export const ALL_PILE_UNLISTED = 'unlisted';
/** Select action only — never a URL `pile` value. Opens the New list dialog. */
export const ALL_PILE_NEW_LIST = 'new-list';

export type AllPile =
  | { kind: 'overview' }
  | { kind: 'unlisted' }
  | { kind: 'named'; listId: string };

export type NamedListRef = {
  id: string;
  name: string;
};

export type AllPileGroup = {
  key: string;
  name: string;
  kind: 'named' | 'unlisted';
  tasks: Task[];
};

export function parseAllPile(pile: string | undefined): AllPile {
  if (!pile || pile === ALL_PILE_OVERVIEW) {
    return { kind: 'overview' };
  }
  if (pile === ALL_PILE_UNLISTED) {
    return { kind: 'unlisted' };
  }
  return { kind: 'named', listId: pile };
}

export function allPileSelectValue(pile: AllPile): string {
  if (pile.kind === 'overview') {
    return ALL_PILE_OVERVIEW;
  }
  if (pile.kind === 'unlisted') {
    return ALL_PILE_UNLISTED;
  }
  return pile.listId;
}

/**
 * Group filter-result tasks by named list, then unlisted.
 * Keeps each group's relative order from the API (pin then createdAt).
 * Does not sort by openOrder. Used by All overview, Mine overview,
 * Upcoming, and inside each Today deadline section.
 */
export function groupAllTasksByPile(
  tasks: Task[],
  namedLists: NamedListRef[]
): AllPileGroup[] {
  const tasksByListId = new Map<string, Task[]>();
  const unlisted: Task[] = [];

  for (const task of tasks) {
    if (task.listId) {
      const existing = tasksByListId.get(task.listId);
      if (existing) {
        existing.push(task);
      } else {
        tasksByListId.set(task.listId, [task]);
      }
    } else {
      unlisted.push(task);
    }
  }

  const groups: AllPileGroup[] = [];
  const listedIds = new Set(namedLists.map((list) => list.id));

  for (const list of namedLists) {
    const listTasks = tasksByListId.get(list.id);
    if (listTasks && listTasks.length > 0) {
      groups.push({
        key: list.id,
        name: list.name,
        kind: 'named',
        tasks: listTasks,
      });
    }
  }

  for (const [listId, listTasks] of tasksByListId) {
    if (!listedIds.has(listId) && listTasks.length > 0) {
      groups.push({
        key: listId,
        name: 'List',
        kind: 'named',
        tasks: listTasks,
      });
    }
  }

  if (unlisted.length > 0) {
    groups.push({
      key: ALL_PILE_UNLISTED,
      name: 'Unlisted',
      kind: 'unlisted',
      tasks: unlisted,
    });
  }

  return groups;
}

/**
 * Slice a board-filter result to one pile. Preserves API order.
 * Does not sort by openOrder. Mine one-pile uses this instead of the
 * list/unlisted pile APIs (those return everyone’s open tasks).
 */
export function tasksInPile(tasks: Task[], pile: AllPile): Task[] {
  if (pile.kind === 'overview') {
    return tasks;
  }
  if (pile.kind === 'unlisted') {
    return tasks.filter((task) => !task.listId);
  }
  return tasks.filter((task) => task.listId === pile.listId);
}
