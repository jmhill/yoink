import { CheckSquare, FolderKanban, Inbox, ListFilter } from 'lucide-react';
import { shouldShowInboxCount } from './app-rail';

export const MOBILE_TABS = [
  { key: 'capture', label: 'Capture', to: '/', icon: Inbox },
  { key: 'process', label: 'Process', to: '/process', icon: ListFilter },
  { key: 'work', label: 'Work', to: '/work', icon: CheckSquare },
  { key: 'review', label: 'Review', to: '/projects', icon: FolderKanban },
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
  if (!shouldShowInboxCount(total)) {
    return null;
  }
  return total;
}
