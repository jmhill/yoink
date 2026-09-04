import { describe, expect, it } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import {
  ALL_PILE_OVERVIEW,
  ALL_PILE_UNLISTED,
  allPileSelectValue,
  groupAllTasksByPile,
  listIdForCreateTask,
  mineUrlHasLeftoverPile,
  namedPileSearch,
  parseAllPile,
  parsePileScreen,
  showsCreateTaskListPicker,
  tasksBoardLanding,
  tasksBoardSearchEquals,
  tasksInPile,
  tasksSearchWithoutMinePile,
  todaySearch,
  unlistedPileSearch,
} from './all-tasks-piles';

const orgId = '00000000-0000-0000-0000-000000000001';
const userId = '00000000-0000-0000-0000-000000000002';
const groceriesId = '00000000-0000-0000-0000-000000000010';
const weekendId = '00000000-0000-0000-0000-000000000011';

const task = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  organizationId: orgId,
  createdById: userId,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

describe('parseAllPile', () => {
  it('defaults omitted and overview to the grouped view', () => {
    expect(parseAllPile(undefined)).toEqual({ kind: 'overview' });
    expect(parseAllPile(ALL_PILE_OVERVIEW)).toEqual({ kind: 'overview' });
  });

  it('parses unlisted and a named list id', () => {
    expect(parseAllPile(ALL_PILE_UNLISTED)).toEqual({ kind: 'unlisted' });
    expect(parseAllPile(groceriesId)).toEqual({ kind: 'named', listId: groceriesId });
  });
});

describe('allPileSelectValue', () => {
  it('maps each mode to the kit Select value', () => {
    expect(allPileSelectValue({ kind: 'overview' })).toBe(ALL_PILE_OVERVIEW);
    expect(allPileSelectValue({ kind: 'unlisted' })).toBe(ALL_PILE_UNLISTED);
    expect(allPileSelectValue({ kind: 'named', listId: groceriesId })).toBe(groceriesId);
  });
});

describe('parsePileScreen', () => {
  it('is null for omitted pile and retired All overview', () => {
    expect(parsePileScreen(undefined)).toBeNull();
    expect(parsePileScreen(ALL_PILE_OVERVIEW)).toBeNull();
  });

  it('parses unlisted and a named list id', () => {
    expect(parsePileScreen(ALL_PILE_UNLISTED)).toEqual({ kind: 'unlisted' });
    expect(parsePileScreen(groceriesId)).toEqual({ kind: 'named', listId: groceriesId });
  });
});

describe('tasksBoardLanding', () => {
  it('sends old All URLs to Today, including leftover pile', () => {
    expect(tasksBoardLanding({ filter: 'all' })).toEqual({ filter: 'today' });
    expect(tasksBoardLanding({ filter: 'all', pile: groceriesId })).toEqual({
      filter: 'today',
    });
    expect(tasksBoardLanding({ filter: 'all', pile: ALL_PILE_UNLISTED })).toEqual({
      filter: 'today',
    });
    expect(tasksBoardLanding({ pile: ALL_PILE_OVERVIEW })).toEqual({ filter: 'today' });
    expect(tasksBoardLanding({})).toEqual({ filter: 'today' });
  });

  it('keeps smart views and drops leftover pile on them', () => {
    expect(tasksBoardLanding({ filter: 'today' })).toEqual({ filter: 'today' });
    expect(tasksBoardLanding({ filter: 'mine', pile: groceriesId })).toEqual({
      filter: 'mine',
    });
    expect(tasksBoardLanding({ filter: 'upcoming', pile: ALL_PILE_UNLISTED })).toEqual({
      filter: 'upcoming',
    });
    expect(tasksBoardLanding({ filter: 'completed' })).toEqual({ filter: 'completed' });
  });

  it('keeps named-list and Unlisted pile screens without a filter', () => {
    expect(tasksBoardLanding({ pile: groceriesId })).toEqual({ pile: groceriesId });
    expect(tasksBoardLanding({ pile: ALL_PILE_UNLISTED })).toEqual({
      pile: ALL_PILE_UNLISTED,
    });
  });
});

describe('tasksBoardSearchEquals', () => {
  it('is true only when filter and pile both match the landing', () => {
    expect(tasksBoardSearchEquals({ filter: 'today' }, { filter: 'today' })).toBe(true);
    expect(tasksBoardSearchEquals({ pile: groceriesId }, { pile: groceriesId })).toBe(true);
    expect(tasksBoardSearchEquals({ filter: 'all' }, { filter: 'today' })).toBe(false);
    expect(
      tasksBoardSearchEquals({ filter: 'all', pile: groceriesId }, { filter: 'today' })
    ).toBe(false);
  });
});

describe('pile screen search helpers', () => {
  it('builds pile-only and Today search', () => {
    expect(namedPileSearch(groceriesId)).toEqual({ pile: groceriesId });
    expect(unlistedPileSearch()).toEqual({ pile: ALL_PILE_UNLISTED });
    expect(todaySearch()).toEqual({ filter: 'today' });
  });
});

describe('showsCreateTaskListPicker', () => {
  it('hides the picker on named-list and Unlisted pile screens', () => {
    expect(showsCreateTaskListPicker({ kind: 'named', listId: groceriesId })).toBe(false);
    expect(showsCreateTaskListPicker({ kind: 'unlisted' })).toBe(false);
  });

  it('keeps the picker on smart views', () => {
    expect(showsCreateTaskListPicker(null)).toBe(true);
    expect(showsCreateTaskListPicker({ kind: 'overview' })).toBe(true);
  });
});

describe('listIdForCreateTask', () => {
  it('creates onto the current named pile and ignores the picker', () => {
    expect(
      listIdForCreateTask({
        allPile: { kind: 'named', listId: groceriesId },
        pickedListId: weekendId,
      })
    ).toBe(groceriesId);
  });

  it('omits listId on Unlisted even if the picker still has a value', () => {
    expect(
      listIdForCreateTask({
        allPile: { kind: 'unlisted' },
        pickedListId: groceriesId,
      })
    ).toBeUndefined();
  });

  it('uses the picker on smart views', () => {
    expect(listIdForCreateTask({ allPile: null, pickedListId: groceriesId })).toBe(
      groceriesId
    );
    expect(
      listIdForCreateTask({ allPile: { kind: 'overview' }, pickedListId: groceriesId })
    ).toBe(groceriesId);
    expect(listIdForCreateTask({ allPile: null, pickedListId: '' })).toBeUndefined();
    expect(
      listIdForCreateTask({ allPile: { kind: 'overview' }, pickedListId: '' })
    ).toBeUndefined();
  });
});

describe('groupAllTasksByPile', () => {
  const namedLists = [
    { id: groceriesId, name: 'Groceries' },
    { id: weekendId, name: 'Weekend' },
  ];

  it('groups named-list tasks then unlisted, keeping All API order within each pile', () => {
    const tasks = [
      task({ id: '00000000-0000-0000-0000-000000000021', title: 'Errand', openOrder: 0 }),
      task({
        id: '00000000-0000-0000-0000-000000000022',
        title: 'Eggs',
        listId: groceriesId,
        openOrder: 1,
      }),
      task({ id: '00000000-0000-0000-0000-000000000023', title: 'Notes', openOrder: 1 }),
      task({
        id: '00000000-0000-0000-0000-000000000024',
        title: 'Milk',
        listId: groceriesId,
        openOrder: 0,
      }),
    ];

    const groups = groupAllTasksByPile(tasks, namedLists);

    expect(groups.map((group) => group.name)).toEqual(['Groceries', 'Unlisted']);
    expect(groups[0]?.tasks.map((item) => item.title)).toEqual(['Eggs', 'Milk']);
    expect(groups[1]?.tasks.map((item) => item.title)).toEqual(['Errand', 'Notes']);
  });

  it('does not sort a group by openOrder', () => {
    const tasks = [
      task({
        id: '00000000-0000-0000-0000-000000000031',
        title: 'Pinned later',
        listId: groceriesId,
        openOrder: 0,
        pinnedAt: '2026-09-01T12:00:00.000Z',
      }),
      task({
        id: '00000000-0000-0000-0000-000000000032',
        title: 'Earlier in openOrder',
        listId: groceriesId,
        openOrder: 1,
      }),
    ];

    const groups = groupAllTasksByPile(tasks, namedLists);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tasks.map((item) => item.title)).toEqual([
      'Pinned later',
      'Earlier in openOrder',
    ]);
  });

  it('omits named lists that have no All-view tasks', () => {
    const tasks = [
      task({ id: '00000000-0000-0000-0000-000000000041', title: 'Notes' }),
    ];

    const groups = groupAllTasksByPile(tasks, namedLists);

    expect(groups.map((group) => group.name)).toEqual(['Unlisted']);
  });
});

describe('tasksInPile', () => {
  const groceriesTasks = [
    task({
      id: '00000000-0000-0000-0000-000000000051',
      title: 'Eggs',
      listId: groceriesId,
      openOrder: 1,
    }),
    task({
      id: '00000000-0000-0000-0000-000000000052',
      title: 'Milk',
      listId: groceriesId,
      openOrder: 0,
    }),
  ];
  const unlistedTasks = [
    task({ id: '00000000-0000-0000-0000-000000000053', title: 'Notes', openOrder: 0 }),
  ];
  const tasks = [...groceriesTasks, ...unlistedTasks];

  it('returns the full result for overview', () => {
    expect(tasksInPile(tasks, { kind: 'overview' })).toEqual(tasks);
  });

  it('keeps API order for a named list and does not sort by openOrder', () => {
    expect(
      tasksInPile(tasks, { kind: 'named', listId: groceriesId }).map((item) => item.title)
    ).toEqual(['Eggs', 'Milk']);
  });

  it('returns only unlisted tasks', () => {
    expect(tasksInPile(tasks, { kind: 'unlisted' }).map((item) => item.title)).toEqual([
      'Notes',
    ]);
  });
});

describe('tasksSearchWithoutMinePile', () => {
  it('drops pile on Mine and leaves All search alone', () => {
    expect(tasksSearchWithoutMinePile({ filter: 'mine', pile: groceriesId })).toEqual({
      filter: 'mine',
    });
    expect(tasksSearchWithoutMinePile({ filter: 'mine', pile: ALL_PILE_UNLISTED })).toEqual({
      filter: 'mine',
    });
    expect(tasksSearchWithoutMinePile({ filter: 'mine' })).toEqual({ filter: 'mine' });
    expect(tasksSearchWithoutMinePile({ filter: 'all', pile: groceriesId })).toEqual({
      filter: 'all',
      pile: groceriesId,
    });
  });
});

describe('mineUrlHasLeftoverPile', () => {
  it('is true only for Mine URLs that still carry a pile', () => {
    expect(mineUrlHasLeftoverPile('?filter=mine&pile=unlisted')).toBe(true);
    expect(mineUrlHasLeftoverPile(`filter=mine&pile=${groceriesId}`)).toBe(true);
    expect(mineUrlHasLeftoverPile('?filter=mine')).toBe(false);
    expect(mineUrlHasLeftoverPile(`?filter=all&pile=${groceriesId}`)).toBe(false);
  });
});
