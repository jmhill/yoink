import { CheckSquare, FolderKanban, Inbox, ListFilter } from 'lucide-react';

export const MOBILE_TAB_DESTINATIONS = [
  { key: 'capture', label: 'Capture', to: '/' },
  { key: 'process', label: 'Process', to: '/process' },
  { key: 'work', label: 'Work', to: '/work' },
  { key: 'review', label: 'Review', to: '/projects' },
] as const;

const MOBILE_TAB_ICONS = {
  capture: Inbox,
  process: ListFilter,
  work: CheckSquare,
  review: FolderKanban,
} as const;

export const MOBILE_TABS = [
  { ...MOBILE_TAB_DESTINATIONS[0], icon: MOBILE_TAB_ICONS.capture },
  { ...MOBILE_TAB_DESTINATIONS[1], icon: MOBILE_TAB_ICONS.process },
  { ...MOBILE_TAB_DESTINATIONS[2], icon: MOBILE_TAB_ICONS.work },
  { ...MOBILE_TAB_DESTINATIONS[3], icon: MOBILE_TAB_ICONS.review },
] as const;

export type MobileTabKey = (typeof MOBILE_TABS)[number]['key'];

export function mobileTabLabels(): string[] {
  return MOBILE_TABS.map((tab) => tab.label);
}

export function activeMobileTab(pathname: string): MobileTabKey | null {
  if (pathname === '/' || pathname === '/snoozed' || pathname === '/trash') {
    return 'capture';
  }
  if (pathname === '/process') {
    return 'process';
  }
  if (
    pathname === '/work' ||
    pathname === '/tasks' ||
    pathname.startsWith('/tasks/') ||
    pathname === '/lists' ||
    pathname.startsWith('/lists/')
  ) {
    return 'work';
  }
  if (pathname === '/projects' || pathname.startsWith('/projects/')) {
    return 'review';
  }
  return null;
}

export function processBadgeCount(total: number): number | null {
  if (total <= 0) {
    return null;
  }
  return total;
}

/** Badge on Review: hidden at 0. Same hide-at-0 rule as Process. */
export function reviewBadgeCount(total: number): number | null {
  return processBadgeCount(total);
}
