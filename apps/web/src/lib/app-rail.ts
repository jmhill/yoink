export const RAIL_SMART_VIEWS = ['today', 'upcoming', 'mine', 'done'] as const;

export type RailSmartView = (typeof RAIL_SMART_VIEWS)[number];

export type RailNamedList = {
  id: string;
  name: string;
};

export type RailItem =
  | { kind: 'inbox'; label: 'Inbox'; count: number }
  | { kind: 'smart'; key: RailSmartView; label: string }
  | { kind: 'named'; listId: string; label: string }
  | { kind: 'unlisted'; label: 'Unlisted' }
  | { kind: 'new-list'; label: 'New list' };

export type RailLocation = {
  pathname: string;
  filter?: string;
  pile?: string;
};

const SMART_VIEW_FILTER: Record<RailSmartView, string> = {
  today: 'today',
  upcoming: 'upcoming',
  mine: 'mine',
  done: 'completed',
};

/** Capture/triage cue under the Inbox mode control — not a destination. */
export const INBOX_MODE_CUE = 'Capture & triage mode';

/** Section label above Today → Done. Not a rail item. */
export const RAIL_TASK_FAMILY_HEADING = 'Task family';

/** Section label above named lists / Unlisted / New list. Not a rail item. */
export const RAIL_LISTS_HEADING = 'Lists';

/**
 * One rail: Inbox as a capture/triage **mode**, then the task family
 * (Today → Done), then named lists, Unlisted last, then New list.
 * Smart views and lists stay the same destinations — no nesting, no
 * new rows. Headings and the mode cue are chrome, not rail items.
 */
export function buildAppRailItems(input: {
  inboxCount: number;
  namedLists: RailNamedList[];
}): RailItem[] {
  return [
    { kind: 'inbox', label: 'Inbox', count: input.inboxCount },
    { kind: 'smart', key: 'today', label: 'Today' },
    { kind: 'smart', key: 'upcoming', label: 'Upcoming' },
    { kind: 'smart', key: 'mine', label: 'Mine' },
    { kind: 'smart', key: 'done', label: 'Done' },
    ...input.namedLists.map((list) => ({
      kind: 'named' as const,
      listId: list.id,
      label: list.name,
    })),
    { kind: 'unlisted', label: 'Unlisted' },
    { kind: 'new-list', label: 'New list' },
  ];
}

/** A zero inbox count is noise — hide the badge. */
export function shouldShowInboxCount(count: number): boolean {
  return count > 0;
}

const isTaskFamilyItem = (item: RailItem): boolean => item.kind === 'smart';

const isListsSectionItem = (item: RailItem): boolean =>
  item.kind === 'named' || item.kind === 'unlisted' || item.kind === 'new-list';

/**
 * Insert the Task family heading once, above Today (the first smart view),
 * after Inbox mode. Smart views stay the same destinations.
 */
export function shouldShowTaskFamilyHeadingBefore(
  item: RailItem,
  previous: RailItem | undefined
): boolean {
  return isTaskFamilyItem(item) && (previous === undefined || !isTaskFamilyItem(previous));
}

/**
 * Insert the Lists heading once, above the first named list (or Unlisted /
 * New list when there are no named lists). Named lists stay flat.
 */
export function shouldShowListsHeadingBefore(
  item: RailItem,
  previous: RailItem | undefined
): boolean {
  return isListsSectionItem(item) && (previous === undefined || !isListsSectionItem(previous));
}

export function railItemLabels(items: RailItem[]): string[] {
  return items.map((item) => item.label);
}

export function isRailItemActive(item: RailItem, location: RailLocation): boolean {
  if (item.kind === 'inbox') {
    return (
      location.pathname === '/' ||
      location.pathname === '/snoozed' ||
      location.pathname === '/trash'
    );
  }

  if (item.kind === 'new-list' || location.pathname !== '/tasks') {
    return false;
  }

  if (item.kind === 'smart') {
    return location.filter === SMART_VIEW_FILTER[item.key];
  }

  if (item.kind === 'unlisted') {
    return location.filter === undefined && location.pile === 'unlisted';
  }

  return location.filter === undefined && location.pile === item.listId;
}

export function railItemKey(item: RailItem): string {
  if (item.kind === 'smart') {
    return item.key;
  }
  if (item.kind === 'named') {
    return item.listId;
  }
  return item.kind;
}

/** Only named-list rows get a kit overflow. Unlisted, Inbox, smart views, and New list do not. */
export function railItemHasOverflow(item: RailItem): boolean {
  return item.kind === 'named';
}

/**
 * Rail labels wrap onto more lines instead of truncating to one ellipsis.
 * Named lists are the pain point; short smart-view / Inbox labels stay
 * one line because they already fit.
 */
export const RAIL_LABEL_WRAP_CLASS = 'min-w-0 whitespace-normal break-words';
