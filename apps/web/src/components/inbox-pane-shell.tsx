import type { ReactNode } from 'react';
import { tsr } from '@/api/client';
import { Header } from '@/components/header';
import { InboxPaneTabs } from '@/components/inbox-pane-tabs';
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
 * Shared capture-pane costume: warm paper surface, Inbox heading +
 * triage subcopy, and Inbox | Snoozed | Trash tabs. Task screens stay
 * on the cool checklist surface.
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
      className="min-h-screen bg-inbox-paper"
    >
      <div className="container mx-auto max-w-2xl p-4">
        <Header />
        <div className="mb-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {INBOX_TRIAGE_HEADING}
          </h1>
          <p
            data-testid={INBOX_TRIAGE_SUBCOPY_TEST_ID}
            className="mt-1 text-muted-foreground"
          >
            {inboxTriageSubcopy(toProcessCount)}
          </p>
        </div>
        <InboxPaneTabs active={active} />
        {children}
      </div>
    </div>
  );
}
