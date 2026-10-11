import type { ReactNode } from 'react';
import { Header } from '@/components/header';
import { InboxPaneTabs } from '@/components/inbox-pane-tabs';
import { PlaceHeading } from '@/components/place-heading';
import {
  INBOX_TRIAGE_HEADING,
  INBOX_TRIAGE_SURFACE_TEST_ID,
  type InboxPaneTabKey,
} from '@/lib/inbox-pane';

type InboxPaneShellProps = {
  active: InboxPaneTabKey;
  children: ReactNode;
};

/**
 * Shared capture-pane costume: semantic inbox-surface token (theme-native
 * subtle lift, not a cream hex), Capture heading, and Inbox | Snoozed |
 * Trash tabs. Task screens stay on --background.
 */
export function InboxPaneShell({ active, children }: InboxPaneShellProps) {
  return (
    <div
      data-testid={INBOX_TRIAGE_SURFACE_TEST_ID}
      data-inbox-triage-surface=""
      className="min-h-screen bg-inbox-surface"
    >
      <div className="container mx-auto max-w-2xl p-4">
        <Header />
        <PlaceHeading title={INBOX_TRIAGE_HEADING} />
        <InboxPaneTabs active={active} />
        {children}
      </div>
    </div>
  );
}
