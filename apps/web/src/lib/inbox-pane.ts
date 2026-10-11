export const INBOX_PANE_TABS = [
  { key: 'inbox', label: 'Inbox', to: '/' },
  { key: 'snoozed', label: 'Snoozed', to: '/snoozed' },
  { key: 'trash', label: 'Trash', to: '/trash' },
] as const;

export type InboxPaneTabKey = (typeof INBOX_PANE_TABS)[number]['key'];

export const INBOX_TRIAGE_HEADING = 'Capture';
export const INBOX_TRIAGE_SURFACE_TEST_ID = 'inbox-triage-surface';
export const TASK_SURFACE_TEST_ID = 'task-surface';

/**
 * Inbox is the home tab. Snoozed and Trash sit beside it on the
 * capture pane — leftover order was Snoozed | Inbox | Trash.
 */
export function inboxPaneTabLabels(): string[] {
  return INBOX_PANE_TABS.map((tab) => tab.label);
}

export function isInboxPanePath(pathname: string): boolean {
  return pathname === '/' || pathname === '/snoozed' || pathname === '/trash';
}
