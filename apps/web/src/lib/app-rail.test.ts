import { describe, expect, it } from 'vitest';
import {
  buildAppRailItems,
  isRailItemActive,
  railItemHasOverflow,
  railItemKey,
  railItemLabels,
  shouldShowInboxCount,
  shouldShowListsHeadingBefore,
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

describe('shouldShowInboxCount', () => {
  it('hides the badge when the count is 0', () => {
    expect(shouldShowInboxCount(0)).toBe(false);
  });

  it('shows the badge when the count is positive', () => {
    expect(shouldShowInboxCount(1)).toBe(true);
    expect(shouldShowInboxCount(3)).toBe(true);
  });
});

describe('shouldShowListsHeadingBefore', () => {
  it('places Lists above the first named list, after Done', () => {
    const items = buildAppRailItems({ inboxCount: 0, namedLists });
    const flags = items.map((item, index) => shouldShowListsHeadingBefore(item, items[index - 1]));

    expect(railItemLabels(items)).not.toContain('Lists');
    expect(flags).toEqual([false, false, false, false, false, true, false, false, false]);
    expect(items[5]).toMatchObject({ kind: 'named', label: 'Groceries' });
  });

  it('places Lists above Unlisted when there are no named lists', () => {
    const items = buildAppRailItems({ inboxCount: 0, namedLists: [] });
    const unlisted = items.find((item) => item.kind === 'unlisted');
    const done = items.find((item) => item.kind === 'smart' && item.key === 'done');

    expect(shouldShowListsHeadingBefore(unlisted!, done)).toBe(true);
    expect(shouldShowListsHeadingBefore(items[items.length - 1]!, unlisted)).toBe(false);
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

  it('marks Inbox for the capture pane — inbox, snoozed, and trash', () => {
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

describe('railItemHasOverflow', () => {
  it('is only true for named-list rows', () => {
    const items = buildAppRailItems({ inboxCount: 0, namedLists });

    expect(items.filter(railItemHasOverflow).map((item) => item.label)).toEqual([
      'Groceries',
      'Weekend',
    ]);
    expect(railItemHasOverflow({ kind: 'inbox', label: 'Inbox', count: 0 })).toBe(false);
    expect(railItemHasOverflow({ kind: 'unlisted', label: 'Unlisted' })).toBe(false);
    expect(railItemHasOverflow({ kind: 'new-list', label: 'New list' })).toBe(false);
    expect(railItemHasOverflow({ kind: 'smart', key: 'today', label: 'Today' })).toBe(false);
  });
});
