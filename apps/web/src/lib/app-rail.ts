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

/**
 * One flat rail: Inbox (with count), smart views, named lists,
 * Unlisted last, then New list. Smart views and lists are peers —
 * no nesting, no Lists heading.
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
    return location.filter === 'all' && location.pile === 'unlisted';
  }

  return location.filter === 'all' && location.pile === item.listId;
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
