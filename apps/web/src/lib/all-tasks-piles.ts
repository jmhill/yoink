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
 * Named-list and Unlisted screens are pile-only (`?pile=`).
 * All overview is gone — omitted pile is not a destination.
 */
export function parsePileScreen(pile: string | undefined): Exclude<AllPile, { kind: 'overview' }> | null {
  if (!pile || pile === ALL_PILE_OVERVIEW) {
    return null;
  }
  if (pile === ALL_PILE_UNLISTED) {
    return { kind: 'unlisted' };
  }
  return { kind: 'named', listId: pile };
}

export type TasksBoardSearch = {
  filter?: string;
  pile?: string;
};

export type TasksBoardLanding =
  | { filter: 'today' | 'upcoming' | 'mine' | 'completed' }
  | { pile: string };

/**
 * All is not a destination. Old All URLs (filter=all, with or without
 * pile, and pile=overview) land on Today. Smart views drop leftover pile.
 * Named-list / Unlisted screens are pile-only.
 */
export function tasksBoardLanding(search: TasksBoardSearch): TasksBoardLanding {
  if (search.filter === 'all' || search.pile === ALL_PILE_OVERVIEW) {
    return { filter: 'today' };
  }
  if (
    search.filter === 'today' ||
    search.filter === 'upcoming' ||
    search.filter === 'mine' ||
    search.filter === 'completed'
  ) {
    return { filter: search.filter };
  }
  if (search.pile === ALL_PILE_UNLISTED || Boolean(search.pile)) {
    return { pile: search.pile as string };
  }
  return { filter: 'today' };
}

export function tasksBoardSearchEquals(
  current: TasksBoardSearch,
  next: TasksBoardLanding
): boolean {
  const currentFilter = current.filter;
  const nextFilter = 'filter' in next ? next.filter : undefined;
  const currentPile = current.pile;
  const nextPile = 'pile' in next ? next.pile : undefined;
  return currentFilter === nextFilter && currentPile === nextPile;
}

export function namedPileSearch(listId: string): { pile: string } {
  return { pile: listId };
}

export function unlistedPileSearch(): { pile: typeof ALL_PILE_UNLISTED } {
  return { pile: ALL_PILE_UNLISTED };
}

export function todaySearch(): { filter: 'today' } {
  return { filter: 'today' };
}

/**
 * The add-task list picker is only for views that are not already one pile.
 * Named-list and Unlisted screens *are* the pile — hide it there.
 * Smart views (Today / Upcoming / Mine / Done) keep it.
 */
export function showsCreateTaskListPicker(allPile: AllPile | null): boolean {
  return allPile?.kind !== 'named' && allPile?.kind !== 'unlisted';
}

/**
 * Create onto the current named-list or Unlisted pile, or use the picker
 * on smart views. Unlisted omits listId.
 */
export function listIdForCreateTask(options: {
  allPile: AllPile | null;
  pickedListId: string;
}): string | undefined {
  if (options.allPile?.kind === 'named') {
    return options.allPile.listId;
  }
  if (options.allPile?.kind === 'unlisted') {
    return undefined;
  }
  return options.pickedListId || undefined;
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
 * Mine is always the grouped overview. Old `?filter=mine&pile=…`
 * search is dropped so those URLs land on plain Mine, not a one-pile
 * view and not a 404.
 */
export function tasksSearchWithoutMinePile<T extends { filter: string; pile?: string }>(
  search: T
): { filter: T['filter']; pile?: string } {
  if (search.filter === 'mine') {
    return { filter: search.filter };
  }
  return search;
}

/** Raw query string from an old Mine one-pile bookmark. */
export function mineUrlHasLeftoverPile(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  return params.get('filter') === 'mine' && params.has('pile');
}

/**
 * Slice a board-filter result to one pile. Preserves API order.
 * Does not sort by openOrder. Used to isolate one pile from a
 * filter result without calling the list/unlisted pile APIs.
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
