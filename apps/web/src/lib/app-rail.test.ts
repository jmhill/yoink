import { describe, expect, it } from 'vitest';
import {
  buildAppRailItems,
  isRailItemActive,
  railItemKey,
  railItemLabels,
} from './app-rail';

const groceriesId = '00000000-0000-0000-0000-000000000010';
const weekendId = '00000000-0000-0000-0000-000000000011';

const namedLists = [
  { id: groceriesId, name: 'Groceries' },
  { id: weekendId, name: 'Weekend' },
];

describe('buildAppRailItems', () => {
  it('orders Inbox, smart views, named lists, Unlisted, then New list', () => {
    const items = buildAppRailItems({ inboxCount: 3, namedLists });

    expect(railItemLabels(items)).toEqual([
      'Inbox',
      'Today',
      'Upcoming',
      'Mine',
      'Done',
      'Groceries',
      'Weekend',
      'Unlisted',
      'New list',
    ]);
    expect(items[0]).toEqual({ kind: 'inbox', label: 'Inbox', count: 3 });
  });

  it('keeps empty named lists findable and does not nest them', () => {
    const items = buildAppRailItems({
      inboxCount: 0,
      namedLists: [{ id: groceriesId, name: 'Groceries' }],
    });

    expect(items.filter((item) => item.kind === 'named')).toEqual([
      { kind: 'named', listId: groceriesId, label: 'Groceries' },
    ]);
    expect(items.some((item) => item.label === 'Lists')).toBe(false);
  });
});

describe('isRailItemActive', () => {
  const items = buildAppRailItems({ inboxCount: 0, namedLists });
  const inbox = items[0]!;
  const today = items[1]!;
  const mine = items[3]!;
  const groceries = items[5]!;
  const unlisted = items[7]!;
  const newList = items[8]!;

  it('marks Inbox for inbox, snoozed, and trash — not for a later Inbox pane', () => {
    expect(isRailItemActive(inbox, { pathname: '/' })).toBe(true);
    expect(isRailItemActive(inbox, { pathname: '/snoozed' })).toBe(true);
    expect(isRailItemActive(inbox, { pathname: '/trash' })).toBe(true);
    expect(isRailItemActive(inbox, { pathname: '/tasks', filter: 'today' })).toBe(false);
  });

  it('marks smart views by filter, including Mine with a pile', () => {
    expect(isRailItemActive(today, { pathname: '/tasks', filter: 'today' })).toBe(true);
    expect(isRailItemActive(mine, { pathname: '/tasks', filter: 'mine' })).toBe(true);
    expect(
      isRailItemActive(mine, { pathname: '/tasks', filter: 'mine', pile: groceriesId })
    ).toBe(true);
    expect(isRailItemActive(today, { pathname: '/tasks', filter: 'upcoming' })).toBe(false);
  });

  it('marks named list and Unlisted only on All one-pile, not All overview', () => {
    expect(
      isRailItemActive(groceries, { pathname: '/tasks', filter: 'all', pile: groceriesId })
    ).toBe(true);
    expect(
      isRailItemActive(unlisted, { pathname: '/tasks', filter: 'all', pile: 'unlisted' })
    ).toBe(true);
    expect(isRailItemActive(groceries, { pathname: '/tasks', filter: 'all' })).toBe(false);
    expect(isRailItemActive(unlisted, { pathname: '/tasks', filter: 'all' })).toBe(false);
    expect(isRailItemActive(newList, { pathname: '/tasks', filter: 'all' })).toBe(false);
  });
});

describe('railItemKey', () => {
  it('uses a stable key per item kind', () => {
    expect(railItemKey({ kind: 'inbox', label: 'Inbox', count: 0 })).toBe('inbox');
    expect(railItemKey({ kind: 'smart', key: 'today', label: 'Today' })).toBe('today');
    expect(railItemKey({ kind: 'named', listId: groceriesId, label: 'Groceries' })).toBe(
      groceriesId
    );
  });
});
