import { describe, expect, it } from 'vitest';
import {
  DESKTOP_RAIL_ROW_CLASS,
  RAIL_LABEL_DESKTOP_CLASS,
  RAIL_LABEL_WRAP_CLASS,
  RAIL_MY_TASKS_LABEL,
  activeDesktopRailRow,
  buildAppRailItems,
  buildDesktopRailSections,
  desktopRailLabels,
  isRailItemActive,
  railItemHasOverflow,
  railItemKey,
  railItemLabels,
  shouldShowInboxCount,
  shouldShowListsHeadingBefore,
  shouldShowTaskFamilyHeadingBefore,
  INBOX_MODE_CUE,
  RAIL_LISTS_HEADING,
  RAIL_PROJECTS_HEADING,
  RAIL_PROPOSED_HEADING,
  RAIL_SOMEDAY_HEADING,
  RAIL_TASK_FAMILY_HEADING,
  partitionRailProjects,
  proposedRailProjects,
  shouldShowProjectsHeadingBefore,
} from './app-rail';
import { MOBILE_TABS, processBadgeCount, reviewBadgeCount } from './mobile-tabs';

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
      'Now',
      'Today',
      'Upcoming',
      'My tasks',
      'Done',
      'Groceries',
      'Weekend',
      'Unlisted',
      'New list',
      'New project',
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

describe('rail chrome copy', () => {
  it('cues Inbox as capture/triage mode and names the task family, without new destinations', () => {
    expect(INBOX_MODE_CUE).toBe('Capture & triage mode');
    expect(RAIL_TASK_FAMILY_HEADING).toBe('Task family');
    expect(RAIL_LISTS_HEADING).toBe('Lists');
    expect(railItemLabels(buildAppRailItems({ inboxCount: 0, namedLists }))).not.toContain(
      INBOX_MODE_CUE
    );
    expect(railItemLabels(buildAppRailItems({ inboxCount: 0, namedLists }))).not.toContain(
      RAIL_TASK_FAMILY_HEADING
    );
  });
});

describe('shouldShowTaskFamilyHeadingBefore', () => {
  it('places Task family above Today, after Inbox', () => {
    const items = buildAppRailItems({ inboxCount: 0, namedLists });
    const flags = items.map((item, index) =>
      shouldShowTaskFamilyHeadingBefore(item, items[index - 1])
    );

    expect(railItemLabels(items)).not.toContain('Task family');
    expect(flags).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(items[0]).toMatchObject({ kind: 'inbox' });
    expect(items[1]).toMatchObject({ kind: 'now' });
    expect(items[2]).toMatchObject({ kind: 'smart', key: 'today' });
  });
});

describe('shouldShowListsHeadingBefore', () => {
  it('places Lists above the first named list, after Done', () => {
    const items = buildAppRailItems({ inboxCount: 0, namedLists });
    const flags = items.map((item, index) => shouldShowListsHeadingBefore(item, items[index - 1]));

    expect(railItemLabels(items)).not.toContain('Lists');
    expect(flags).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(items[6]).toMatchObject({ kind: 'named', label: 'Groceries' });
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
  const now = items[1]!;
  const today = items[2]!;
  const mine = items[4]!;
  const groceries = items[6]!;
  const unlisted = items[8]!;
  const newList = items[9]!;

  it('marks Inbox for the capture pane — inbox, snoozed, and trash', () => {
    expect(isRailItemActive(inbox, { pathname: '/' })).toBe(true);
    expect(isRailItemActive(inbox, { pathname: '/snoozed' })).toBe(true);
    expect(isRailItemActive(inbox, { pathname: '/trash' })).toBe(true);
    expect(isRailItemActive(inbox, { pathname: '/tasks', filter: 'today' })).toBe(false);
  });

  it('marks smart views by filter, including leftover Mine pile URLs as Mine', () => {
    expect(isRailItemActive(today, { pathname: '/tasks', filter: 'today' })).toBe(true);
    expect(isRailItemActive(mine, { pathname: '/tasks', filter: 'mine' })).toBe(true);
    expect(
      isRailItemActive(mine, { pathname: '/tasks', filter: 'mine', pile: groceriesId })
    ).toBe(true);
    expect(
      isRailItemActive(groceries, { pathname: '/tasks', filter: 'mine', pile: groceriesId })
    ).toBe(false);
    expect(isRailItemActive(today, { pathname: '/tasks', filter: 'upcoming' })).toBe(false);
    expect(isRailItemActive(now, { pathname: '/work' })).toBe(true);
    expect(isRailItemActive(now, { pathname: '/tasks', filter: 'today' })).toBe(false);
    expect(isRailItemActive(today, { pathname: '/work' })).toBe(false);
  });

  it('marks named list and Unlisted on pile screens, not on Today or leftover All URLs', () => {
    expect(isRailItemActive(groceries, { pathname: '/tasks', pile: groceriesId })).toBe(true);
    expect(isRailItemActive(unlisted, { pathname: '/tasks', pile: 'unlisted' })).toBe(true);
    expect(
      isRailItemActive(groceries, { pathname: '/tasks', filter: 'all', pile: groceriesId })
    ).toBe(false);
    expect(
      isRailItemActive(unlisted, { pathname: '/tasks', filter: 'all', pile: 'unlisted' })
    ).toBe(false);
    expect(isRailItemActive(groceries, { pathname: '/tasks', filter: 'today' })).toBe(false);
    expect(isRailItemActive(newList, { pathname: '/tasks', pile: groceriesId })).toBe(false);
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

describe('RAIL_LABEL_WRAP_CLASS', () => {
  it('wraps instead of truncating to one ellipsis line', () => {
    expect(RAIL_LABEL_WRAP_CLASS).not.toMatch(/\btruncate\b/);
    expect(RAIL_LABEL_WRAP_CLASS).not.toMatch(/\bbreak-words\b/);
    expect(RAIL_LABEL_WRAP_CLASS).toMatch(/\bbreak-normal\b/);
    expect(RAIL_LABEL_WRAP_CLASS).toMatch(/\bwhitespace-normal\b/);
    expect(RAIL_LABEL_WRAP_CLASS).toMatch(/\bmin-w-0\b/);
    expect(RAIL_LABEL_WRAP_CLASS).toMatch(/\bflex-1\b/);
  });
});

describe('RAIL_LABEL_DESKTOP_CLASS', () => {
  it('keeps desktop labels on one ellipsis line', () => {
    expect(RAIL_LABEL_DESKTOP_CLASS).toMatch(/\btruncate\b/);
    expect(RAIL_LABEL_DESKTOP_CLASS).toMatch(/\bwhitespace-nowrap\b/);
    expect(RAIL_LABEL_DESKTOP_CLASS).toMatch(/\bmin-w-0\b/);
    expect(RAIL_LABEL_DESKTOP_CLASS).toMatch(/\bw-full\b/);
    expect(RAIL_LABEL_DESKTOP_CLASS).not.toMatch(/\bwhitespace-normal\b/);
  });
});

describe('DESKTOP_RAIL_ROW_CLASS', () => {
  it('uses a shared four-column grid on one baseline', () => {
    expect(DESKTOP_RAIL_ROW_CLASS).toMatch(/\bgrid\b/);
    expect(DESKTOP_RAIL_ROW_CLASS).toMatch(
      /grid-cols-\[1\.25rem_minmax\(0,1fr\)_2rem_2rem\]/
    );
    expect(DESKTOP_RAIL_ROW_CLASS).toMatch(/\bitems-center\b/);
    expect(DESKTOP_RAIL_ROW_CLASS).toMatch(/\bjustify-items-start\b/);
  });
});

describe('next-action rail marker', () => {
  it('flags active and waiting projects that have no next action', () => {
    const gardenId = '00000000-0000-0000-0000-000000000030';
    const cabinId = '00000000-0000-0000-0000-000000000031';
    const items = buildAppRailItems({
      inboxCount: 0,
      namedLists: [],
      projects: [
        { id: gardenId, name: 'Garden', status: 'active', nextActionTaskId: null },
        {
          id: cabinId,
          name: 'Cabin',
          status: 'waiting',
          nextActionTaskId: '00000000-0000-0000-0000-000000000099',
        },
      ],
    });
    const garden = items.find((item) => item.kind === 'project' && item.label === 'Garden');
    const cabin = items.find((item) => item.kind === 'project' && item.label === 'Cabin');
    expect(garden).toMatchObject({ missingNextAction: true });
    expect(cabin).toMatchObject({ missingNextAction: false });
  });
});

describe('partitionRailProjects', () => {
  it('lists active and waiting, and parks someday separately', () => {
    const cabinId = '00000000-0000-0000-0000-000000000021';
    const gardenId = '00000000-0000-0000-0000-000000000020';
    const laterId = '00000000-0000-0000-0000-000000000022';
    const doneId = '00000000-0000-0000-0000-000000000023';

    const partitioned = partitionRailProjects([
      { id: laterId, name: 'Later', status: 'someday' },
      { id: gardenId, name: 'Garden', status: 'active' },
      { id: cabinId, name: 'Cabin', status: 'waiting' },
      { id: doneId, name: 'Old', status: 'done' },
    ]);

    expect(partitioned.open.map((project) => project.name)).toEqual(['Cabin', 'Garden']);
    expect(partitioned.someday.map((project) => project.name)).toEqual(['Later']);
  });
});

describe('shouldShowProjectsHeadingBefore', () => {
  it('places Projects above the first project or New project, after New list', () => {
    const items = buildAppRailItems({ inboxCount: 0, namedLists });
    const flags = items.map((item, index) =>
      shouldShowProjectsHeadingBefore(item, items[index - 1])
    );

    expect(RAIL_PROJECTS_HEADING).toBe('Projects');
    expect(RAIL_SOMEDAY_HEADING).toBe('Someday');
    expect(RAIL_PROPOSED_HEADING).toBe('Proposed');
    expect(items[items.length - 1]).toMatchObject({ kind: 'new-project' });
    expect(flags[flags.length - 1]).toBe(true);
  });
});

describe('buildDesktopRailSections', () => {
  const gardenId = '00000000-0000-0000-0000-000000000030';
  const laterId = '00000000-0000-0000-0000-000000000031';

  it('uses the phone tab order, keys, and labels', () => {
    const sections = buildDesktopRailSections({ inboxCount: 0, namedLists: [] });

    expect(sections.map((section) => section.key)).toEqual(MOBILE_TABS.map((tab) => tab.key));
    expect(sections.map((section) => section.label)).toEqual(MOBILE_TABS.map((tab) => tab.label));
    expect(sections.map((section) => section.to)).toEqual(MOBILE_TABS.map((tab) => tab.to));
  });

  it('puts smart views and lists under Work, and projects under Review', () => {
    const sections = buildDesktopRailSections({
      inboxCount: 3,
      namedLists,
      projects: [
        { id: gardenId, name: 'Garden', status: 'active', nextActionTaskId: null },
        { id: laterId, name: 'Later', status: 'someday' },
      ],
    });
    const byKey = Object.fromEntries(sections.map((section) => [section.key, section]));

    expect(byKey.capture?.items).toEqual([]);
    expect(byKey.process?.items).toEqual([]);
    expect(byKey.process?.badge).toBe(3);
    expect(railItemLabels(byKey.work?.items ?? [])).toEqual([
      'Today',
      'Upcoming',
      RAIL_MY_TASKS_LABEL,
      'Done',
      'Groceries',
      'Weekend',
      'Unlisted',
      'New list',
    ]);
    expect(railItemLabels(byKey.review?.items ?? [])).toEqual([
      'Garden',
      'Later',
      'New project',
    ]);
    expect(desktopRailLabels(sections)).toEqual([
      'Capture',
      'Process',
      'Work',
      'Today',
      'Upcoming',
      'My tasks',
      'Done',
      'Groceries',
      'Weekend',
      'Unlisted',
      'New list',
      'Review',
      'Garden',
      'Later',
      'New project',
    ]);
  });

  it('keeps Unlisted and New list when there are no named lists', () => {
    const sections = buildDesktopRailSections({ inboxCount: 0, namedLists: [] });
    const work = sections.find((section) => section.key === 'work');

    expect(railItemLabels(work?.items ?? [])).toEqual([
      'Today',
      'Upcoming',
      'My tasks',
      'Done',
      'Unlisted',
      'New list',
    ]);
  });

  it('keeps New project when there are no projects', () => {
    const sections = buildDesktopRailSections({ inboxCount: 0, namedLists: [] });
    const review = sections.find((section) => section.key === 'review');

    expect(railItemLabels(review?.items ?? [])).toEqual(['New project']);
  });

  it('puts proposed projects in their own group and leaves the working set alone', () => {
    const gunId = '00000000-0000-0000-0000-000000000032';
    const sections = buildDesktopRailSections({
      inboxCount: 0,
      namedLists: [],
      projects: [
        { id: gardenId, name: 'Garden', status: 'active' },
        { id: laterId, name: 'Later', status: 'someday' },
        { id: gunId, name: 'gun storage', status: 'proposed' },
      ],
      proposals: [
        { id: gunId, name: 'gun storage', status: 'proposed' },
        { id: '00000000-0000-0000-0000-000000000033', name: 'Old', status: 'declined' },
      ],
    });
    const review = sections.find((section) => section.key === 'review');

    expect(railItemLabels(review?.items ?? [])).toEqual([
      'Garden',
      'gun storage',
      'Later',
      'New project',
    ]);
    expect(review?.items[1]).toMatchObject({ kind: 'proposed-project', projectId: gunId });
    expect(proposedRailProjects([{ id: gunId, name: 'gun storage', status: 'proposed' }])).toEqual([
      { id: gunId, name: 'gun storage', status: 'proposed' },
    ]);
  });

  it('omits the Proposed group when there are no proposals', () => {
    const sections = buildDesktopRailSections({
      inboxCount: 0,
      namedLists: [],
      projects: [{ id: gardenId, name: 'Garden', status: 'active' }],
    });
    const review = sections.find((section) => section.key === 'review');

    expect(railItemLabels(review?.items ?? [])).toEqual(['Garden', 'New project']);
    expect(review?.items.some((item) => item.kind === 'proposed-project')).toBe(false);
  });

  it('lists proposed projects on the phone drawer between open projects and Someday', () => {
    const gunId = '00000000-0000-0000-0000-000000000032';
    const items = buildAppRailItems({
      inboxCount: 0,
      namedLists: [],
      projects: [
        { id: gardenId, name: 'Garden', status: 'active' },
        { id: laterId, name: 'Later', status: 'someday' },
      ],
      proposals: [{ id: gunId, name: 'gun storage', status: 'proposed' }],
    });

    expect(railItemLabels(items).slice(-4)).toEqual([
      'Garden',
      'gun storage',
      'Later',
      'New project',
    ]);
  });

  it('lists someday-only projects under Review without inventing open ones', () => {
    const sections = buildDesktopRailSections({
      inboxCount: 0,
      namedLists: [],
      projects: [{ id: laterId, name: 'Later', status: 'someday' }],
    });
    const review = sections.find((section) => section.key === 'review');

    expect(railItemLabels(review?.items ?? [])).toEqual(['Later', 'New project']);
    expect(review?.items[0]).toMatchObject({ kind: 'someday-project', projectId: laterId });
  });

  it('adds proposed projects to the Process badge', () => {
    const counted = buildDesktopRailSections({
      inboxCount: 2,
      proposalCount: 1,
      namedLists: [],
    });
    const processCounted = counted.find((section) => section.key === 'process');
    expect(processCounted?.badge).toBe(3);
  });

  it('reuses processBadgeCount for the Process badge, null at 0', () => {
    const empty = buildDesktopRailSections({ inboxCount: 0, namedLists: [] });
    const counted = buildDesktopRailSections({ inboxCount: 19, namedLists: [] });
    const processEmpty = empty.find((section) => section.key === 'process');
    const processCounted = counted.find((section) => section.key === 'process');

    expect(processEmpty?.badge).toBe(processBadgeCount(0));
    expect(processEmpty?.badge).toBeNull();
    expect(processCounted?.badge).toBe(processBadgeCount(19));
    expect(processCounted?.badge).toBe(19);
    expect(empty.find((section) => section.key === 'capture')?.badge).toBeNull();
  });

  it('reuses reviewBadgeCount for the Review badge, null at 0', () => {
    const empty = buildDesktopRailSections({ inboxCount: 0, namedLists: [] });
    const counted = buildDesktopRailSections({
      inboxCount: 0,
      namedLists: [],
      reviewBadge: 2,
    });
    const reviewEmpty = empty.find((section) => section.key === 'review');
    const reviewCounted = counted.find((section) => section.key === 'review');

    expect(reviewEmpty?.badge).toBe(reviewBadgeCount(0));
    expect(reviewEmpty?.badge).toBeNull();
    expect(reviewCounted?.badge).toBe(reviewBadgeCount(2));
    expect(reviewCounted?.badge).toBe(2);
  });
});

describe('activeDesktopRailRow', () => {
  it.each([
    [{ pathname: '/' }, 'capture'],
    [{ pathname: '/snoozed' }, 'capture'],
    [{ pathname: '/trash' }, 'capture'],
    [{ pathname: '/process' }, 'process'],
    [{ pathname: '/work' }, 'work'],
    [{ pathname: '/work', filter: 'ignored' }, 'work'],
    [{ pathname: '/tasks', filter: 'today' }, 'today'],
    [{ pathname: '/tasks', filter: 'upcoming' }, 'upcoming'],
    [{ pathname: '/tasks', filter: 'mine' }, 'mine'],
    [{ pathname: '/tasks', filter: 'completed' }, 'done'],
    [{ pathname: '/tasks', pile: groceriesId }, groceriesId],
    [{ pathname: '/tasks', pile: 'unlisted' }, 'unlisted'],
    [{ pathname: '/projects' }, 'review'],
    [
      { pathname: '/projects/imports/00000000-0000-0000-0000-000000000099' },
      'review',
    ],
    [{ pathname: '/projects/00000000-0000-0000-0000-000000000030' }, '00000000-0000-0000-0000-000000000030'],
    [{ pathname: '/projects/00000000-0000-0000-0000-000000000031' }, '00000000-0000-0000-0000-000000000031'],
    [{ pathname: '/settings' }, null],
    [{ pathname: '/not-a-route' }, null],
  ] as const)('lights %j as %s', (location, expected) => {
    expect(activeDesktopRailRow(location)).toBe(expected);
  });

  it('lights Work on /work?mine=true (Now’s Mine toggle, not the smart view)', () => {
    expect(activeDesktopRailRow({ pathname: '/work' })).toBe('work');
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
