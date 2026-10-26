import {
  MOBILE_TAB_DESTINATIONS,
  activeMobileTab,
  processBadgeCount,
  reviewBadgeCount,
  type MobileTabKey,
} from './mobile-tabs';
import { processBadgeTotal } from './process-queue';
import { showsNoNextActionWarning } from './project-next-action';

/** Visible label for the Mine smart view. Now’s Mine toggle stays “Mine”. */
export const RAIL_MY_TASKS_LABEL = 'My tasks';

export const RAIL_SMART_VIEWS = ['today', 'upcoming', 'mine', 'done'] as const;

export type RailSmartView = (typeof RAIL_SMART_VIEWS)[number];

export type RailNamedList = {
  id: string;
  name: string;
};

export type RailProject = {
  id: string;
  name: string;
  status: 'active' | 'waiting' | 'someday' | 'done' | 'proposed' | 'declined';
  nextActionTaskId?: string | null;
};

export type RailItem =
  | { kind: 'inbox'; label: 'Inbox'; count: number }
  | { kind: 'now'; label: 'Now' }
  | { kind: 'smart'; key: RailSmartView; label: string }
  | { kind: 'named'; listId: string; label: string }
  | { kind: 'unlisted'; label: 'Unlisted' }
  | { kind: 'new-list'; label: 'New list' }
  | { kind: 'project'; projectId: string; label: string; missingNextAction: boolean }
  | { kind: 'someday-project'; projectId: string; label: string }
  | { kind: 'new-project'; label: 'New project' };

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

/** Section label above projects / New project. Not a rail item. */
export const RAIL_PROJECTS_HEADING = 'Projects';

/** Collapsed group label for someday projects. Not a rail item. */
export const RAIL_SOMEDAY_HEADING = 'Someday';

const byName = (left: { name: string }, right: { name: string }): number =>
  left.name.localeCompare(right.name);

export function partitionRailProjects(projects: RailProject[]): {
  open: RailProject[];
  someday: RailProject[];
} {
  return {
    open: projects
      .filter((project) => project.status === 'active' || project.status === 'waiting')
      .slice()
      .sort(byName),
    someday: projects
      .filter((project) => project.status === 'someday')
      .slice()
      .sort(byName),
  };
}

/**
 * One rail: Inbox as a capture/triage **mode**, then the task family
 * (Now above Today → Done), then named lists, Unlisted last, then New list,
 * then Projects (active/waiting, collapsed Someday, New project).
 */
export function buildAppRailItems(input: {
  inboxCount: number;
  namedLists: RailNamedList[];
  projects?: RailProject[];
}): RailItem[] {
  const { open, someday } = partitionRailProjects(input.projects ?? []);
  return [
    { kind: 'inbox', label: 'Inbox', count: input.inboxCount },
    { kind: 'now', label: 'Now' },
    { kind: 'smart', key: 'today', label: 'Today' },
    { kind: 'smart', key: 'upcoming', label: 'Upcoming' },
    { kind: 'smart', key: 'mine', label: RAIL_MY_TASKS_LABEL },
    { kind: 'smart', key: 'done', label: 'Done' },
    ...input.namedLists.map((list) => ({
      kind: 'named' as const,
      listId: list.id,
      label: list.name,
    })),
    { kind: 'unlisted', label: 'Unlisted' },
    { kind: 'new-list', label: 'New list' },
    ...open.map((project) => ({
      kind: 'project' as const,
      projectId: project.id,
      label: project.name,
      missingNextAction: showsNoNextActionWarning({
        status: project.status,
        nextActionTaskId: project.nextActionTaskId ?? null,
      }),
    })),
    ...someday.map((project) => ({
      kind: 'someday-project' as const,
      projectId: project.id,
      label: project.name,
    })),
    { kind: 'new-project', label: 'New project' },
  ];
}

/** A zero inbox count is noise — hide the badge. Same rule as Process. */
export function shouldShowInboxCount(count: number): boolean {
  return processBadgeCount(count) !== null;
}

const isTaskFamilyItem = (item: RailItem): boolean =>
  item.kind === 'now' || item.kind === 'smart';

const isListsSectionItem = (item: RailItem): boolean =>
  item.kind === 'named' || item.kind === 'unlisted' || item.kind === 'new-list';

const isProjectsSectionItem = (item: RailItem): boolean =>
  item.kind === 'project' || item.kind === 'someday-project' || item.kind === 'new-project';

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

export function shouldShowProjectsHeadingBefore(
  item: RailItem,
  previous: RailItem | undefined
): boolean {
  return (
    isProjectsSectionItem(item) && (previous === undefined || !isProjectsSectionItem(previous))
  );
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

  if (item.kind === 'new-list' || item.kind === 'new-project') {
    return false;
  }

  if (item.kind === 'now') {
    return location.pathname === '/work';
  }

  if (item.kind === 'project' || item.kind === 'someday-project') {
    return location.pathname === `/projects/${item.projectId}`;
  }

  if (location.pathname !== '/tasks') {
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
  if (item.kind === 'now') {
    return 'now';
  }
  if (item.kind === 'smart') {
    return item.key;
  }
  if (item.kind === 'named') {
    return item.listId;
  }
  if (item.kind === 'project' || item.kind === 'someday-project') {
    return item.projectId;
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
export const RAIL_LABEL_WRAP_CLASS =
  'min-w-0 flex-1 whitespace-normal break-normal [overflow-wrap:normal]';

/** Desktop rail stays one line; long names ellipsize instead of wrapping. */
export const RAIL_LABEL_DESKTOP_CLASS = 'min-w-0 w-full truncate whitespace-nowrap';

export const DESKTOP_RAIL_ROW_CLASS =
  'grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_2rem_2rem] items-center justify-items-start gap-x-2 rounded-md px-3 py-2 text-sm transition-colors';

export type DesktopRailSection = {
  key: MobileTabKey;
  label: string;
  to: (typeof MOBILE_TAB_DESTINATIONS)[number]['to'];
  items: RailItem[];
  badge: number | null;
};

const workSectionItems = (namedLists: RailNamedList[]): RailItem[] => [
  { kind: 'smart', key: 'today', label: 'Today' },
  { kind: 'smart', key: 'upcoming', label: 'Upcoming' },
  { kind: 'smart', key: 'mine', label: RAIL_MY_TASKS_LABEL },
  { kind: 'smart', key: 'done', label: 'Done' },
  ...namedLists.map((list) => ({
    kind: 'named' as const,
    listId: list.id,
    label: list.name,
  })),
  { kind: 'unlisted', label: 'Unlisted' },
  { kind: 'new-list', label: 'New list' },
];

const reviewSectionItems = (projects: RailProject[]): RailItem[] => {
  const { open, someday } = partitionRailProjects(projects);
  return [
    ...open.map((project) => ({
      kind: 'project' as const,
      projectId: project.id,
      label: project.name,
      missingNextAction: showsNoNextActionWarning({
        status: project.status,
        nextActionTaskId: project.nextActionTaskId ?? null,
      }),
    })),
    ...someday.map((project) => ({
      kind: 'someday-project' as const,
      projectId: project.id,
      label: project.name,
    })),
    { kind: 'new-project', label: 'New project' },
  ];
};

const itemsForDesktopSection = (
  key: MobileTabKey,
  input: { namedLists: RailNamedList[]; projects: RailProject[] }
): RailItem[] => {
  if (key === 'work') {
    return workSectionItems(input.namedLists);
  }
  if (key === 'review') {
    return reviewSectionItems(input.projects);
  }
  return [];
};

/**
 * Desktop sidebar: four section rows from the phone tabs, with Work’s
 * smart views + lists and Review’s projects indented underneath.
 */
export function buildDesktopRailSections(input: {
  inboxCount: number;
  proposalCount?: number;
  namedLists: RailNamedList[];
  projects?: RailProject[];
  reviewBadge?: number;
}): DesktopRailSection[] {
  const namedLists = input.namedLists;
  const projects = input.projects ?? [];
  return MOBILE_TAB_DESTINATIONS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    to: tab.to,
    items: itemsForDesktopSection(tab.key, { namedLists, projects }),
    badge:
      tab.key === 'process'
        ? processBadgeCount(processBadgeTotal(input.inboxCount, input.proposalCount ?? 0))
        : tab.key === 'review'
          ? reviewBadgeCount(input.reviewBadge ?? 0)
          : null,
  }));
}

export function desktopRailLabels(sections: DesktopRailSection[]): string[] {
  return sections.flatMap((section) => [
    section.label,
    ...section.items.map((item) => item.label),
  ]);
}

const SMART_VIEW_ITEMS: RailItem[] = workSectionItems([]).filter(
  (item): item is Extract<RailItem, { kind: 'smart' }> => item.kind === 'smart'
);

const projectIdFromPath = (pathname: string): string | null => {
  const prefix = '/projects/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const rest = pathname.slice(prefix.length);
  if (rest === '' || rest.startsWith('imports/') || rest.includes('/')) {
    return null;
  }
  return rest;
};

const activeWorkChildRow = (location: RailLocation): string | null => {
  const namedItems: RailItem[] =
    location.pile !== undefined && location.pile !== 'unlisted'
      ? [{ kind: 'named', listId: location.pile, label: '' }]
      : [];
  const candidates: RailItem[] = [
    ...SMART_VIEW_ITEMS,
    { kind: 'unlisted', label: 'Unlisted' },
    ...namedItems,
  ];
  const hit = candidates.find((item) => isRailItemActive(item, location));
  return hit === undefined ? null : railItemKey(hit);
};

const activeReviewChildRow = (location: RailLocation): string | null => {
  if (location.pathname === '/projects' || location.pathname.startsWith('/projects/imports/')) {
    return null;
  }
  const projectId = projectIdFromPath(location.pathname);
  if (projectId === null) {
    return null;
  }
  const projectItem: RailItem = {
    kind: 'project',
    projectId,
    label: '',
    missingNextAction: false,
  };
  if (isRailItemActive(projectItem, location)) {
    return railItemKey(projectItem);
  }
  const somedayItem: RailItem = { kind: 'someday-project', projectId, label: '' };
  if (isRailItemActive(somedayItem, location)) {
    return railItemKey(somedayItem);
  }
  return null;
};

/**
 * The one desktop row to light: a section key or a child `railItemKey`.
 * Section membership comes from `activeMobileTab`; child rows reuse
 * `isRailItemActive`. Settings and unknown paths light nothing.
 */
export function activeDesktopRailRow(location: RailLocation): string | null {
  const tab = activeMobileTab(location.pathname);
  if (tab === null) {
    return null;
  }
  if (tab === 'work') {
    const child = activeWorkChildRow(location);
    return child ?? 'work';
  }
  if (tab === 'review') {
    const child = activeReviewChildRow(location);
    return child ?? 'review';
  }
  return tab;
}
