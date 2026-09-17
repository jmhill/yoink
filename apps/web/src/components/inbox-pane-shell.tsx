import type { ReactNode } from 'react';
import { tsr } from '@/api/client';
import { Header } from '@/components/header';
import { InboxPaneTabs } from '@/components/inbox-pane-tabs';
import { PlaceHeading } from '@/components/place-heading';
import {
  INBOX_TRIAGE_HEADING,
  INBOX_TRIAGE_SUBCOPY_TEST_ID,
  INBOX_TRIAGE_SURFACE_TEST_ID,
  inboxTriageSubcopy,
  type InboxPaneTabKey,
} from '@/lib/inbox-pane';

type InboxPaneShellProps = {
  active: InboxPaneTabKey;
  children: ReactNode;
};

/**
 * Shared capture-pane costume: semantic inbox-surface token (theme-native
 * subtle lift, not a cream hex), light Inbox heading + triage subcopy,
 * and Inbox | Snoozed | Trash tabs. Task screens stay on --background.
 */
export function InboxPaneShell({ active, children }: InboxPaneShellProps) {
  const { data } = tsr.list.useQuery({
    queryKey: ['captures', 'inbox'],
    queryData: { query: { status: 'inbox' as const, snoozed: false } },
  });
  const toProcessCount = data?.status === 200 ? data.body.captures.length : 0;

  return (
    <div
      data-testid={INBOX_TRIAGE_SURFACE_TEST_ID}
      data-inbox-triage-surface=""
      className="min-h-screen bg-inbox-surface"
    >
      <div className="container mx-auto max-w-2xl p-4">
        <Header />
        <PlaceHeading
          title={INBOX_TRIAGE_HEADING}
          subcopy={inboxTriageSubcopy(toProcessCount)}
          subcopyTestId={INBOX_TRIAGE_SUBCOPY_TEST_ID}
        />
        <InboxPaneTabs active={active} />
        {children}
      </div>
    </div>
  );
}
