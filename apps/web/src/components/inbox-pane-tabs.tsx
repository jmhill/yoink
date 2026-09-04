import { Link } from '@tanstack/react-router';
import { Tabs, TabsList, TabsTrigger } from '@yoink/ui-base/components/tabs';
import { Clock, Inbox, Trash2 } from 'lucide-react';
import { INBOX_PANE_TABS, type InboxPaneTabKey } from '@/lib/inbox-pane';

const TAB_ICON = {
  inbox: Inbox,
  snoozed: Clock,
  trash: Trash2,
} as const;

type InboxPaneTabsProps = {
  active: InboxPaneTabKey;
};

export function InboxPaneTabs({ active }: InboxPaneTabsProps) {
  return (
    <Tabs value={active} className="mb-6">
      <TabsList data-inbox-pane-tabs="" className="grid w-full grid-cols-3">
        {INBOX_PANE_TABS.map((tab) => {
          const Icon = TAB_ICON[tab.key];
          return (
            <TabsTrigger key={tab.key} value={tab.key} asChild>
              <Link
                to={tab.to}
                data-inbox-pane-tab={tab.key}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
