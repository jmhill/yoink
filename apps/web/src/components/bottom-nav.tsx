import { Fragment, useState } from 'react';
import { Link, useMatchRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@yoink/ui-base/components/dropdown-menu';
import { cn } from '@yoink/ui-base/lib/utils';
import {
  Calendar,
  CalendarClock,
  CheckCheck,
  CheckSquare,
  Inbox,
  List,
  MoreHorizontal,
  Plus,
  User,
} from 'lucide-react';
import { tsr, tsrLists } from '@/api/client';
import { CreateNamedListDialog } from '@/components/create-named-list-dialog';
import { DeleteNamedListDialog } from '@/components/delete-named-list-dialog';
import {
  buildAppRailItems,
  isRailItemActive,
  railItemHasOverflow,
  railItemKey,
  shouldShowInboxCount,
  shouldShowListsHeadingBefore,
  type RailItem,
  type RailLocation,
} from '@/lib/app-rail';

type MobileNavItem = {
  to: string;
  label: string;
  icon: typeof Inbox;
  matchPaths: string[];
};

const mobileNavItems: MobileNavItem[] = [
  {
    to: '/',
    label: 'Inbox',
    icon: Inbox,
    matchPaths: ['/', '/snoozed', '/trash'],
  },
  {
    to: '/tasks',
    label: 'Tasks',
    icon: CheckSquare,
    matchPaths: ['/tasks', '/lists', '/lists/$listId'],
  },
];

const railIcon = (item: RailItem) => {
  if (item.kind === 'inbox') return Inbox;
  if (item.kind === 'unlisted' || item.kind === 'named') return List;
  if (item.kind === 'new-list') return Plus;
  if (item.key === 'today') return Calendar;
  if (item.key === 'upcoming') return CalendarClock;
  if (item.key === 'mine') return User;
  return CheckCheck;
};

type TaskFilterSearch = 'all' | 'today' | 'upcoming' | 'mine' | 'completed';

const SMART_VIEW_FILTER: Record<
  Extract<RailItem, { kind: 'smart' }>['key'],
  Exclude<TaskFilterSearch, 'all'>
> = {
  today: 'today',
  upcoming: 'upcoming',
  mine: 'mine',
  done: 'completed',
};

const railTaskSearch = (
  item: Extract<RailItem, { kind: 'smart' } | { kind: 'named' } | { kind: 'unlisted' }>
): { filter: TaskFilterSearch; pile?: string } => {
  if (item.kind === 'smart') {
    return { filter: SMART_VIEW_FILTER[item.key] };
  }
  if (item.kind === 'named') {
    return { filter: 'all', pile: item.listId };
  }
  return { filter: 'all', pile: 'unlisted' };
};

export function AppNav() {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const searchRecord = search && typeof search === 'object' ? search : {};
  const [createListOpen, setCreateListOpen] = useState(false);
  const [deletingList, setDeletingList] = useState<{ id: string; name: string } | null>(null);

  const { data: inboxData } = tsr.list.useQuery({
    queryKey: ['captures', 'inbox'],
    queryData: { query: { status: 'inbox' as const, snoozed: false } },
  });
  const { data: listsData } = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: {},
  });

  const inboxCount = inboxData?.status === 200 ? inboxData.body.captures.length : 0;
  const namedLists = listsData?.status === 200 ? listsData.body.lists : [];
  const railItems = buildAppRailItems({ inboxCount, namedLists });
  const location: RailLocation = {
    pathname,
    filter:
      'filter' in searchRecord && typeof searchRecord.filter === 'string'
        ? searchRecord.filter
        : undefined,
    pile:
      'pile' in searchRecord && typeof searchRecord.pile === 'string'
        ? searchRecord.pile
        : undefined,
  };

  const isMobileActive = (item: MobileNavItem) => {
    return item.matchPaths.some((path) => matchRoute({ to: path }));
  };

  const railClassName = (active: boolean) =>
    cn(
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
      active
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    );

  return (
    <>
      {/* Mobile: existing Inbox | Tasks bottom tabs. Redesign stays later. */}
      <nav
        data-app-mobile-nav=""
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background safe-area-bottom md:hidden"
      >
        <div className="container mx-auto max-w-2xl">
          <div className="flex justify-around">
            {mobileNavItems.map((item) => {
              const active = isMobileActive(item);
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                    active
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <nav
        data-app-rail=""
        aria-label="App rail"
        className="fixed left-0 top-0 z-50 hidden h-full w-48 flex-col border-r bg-background p-4 md:flex"
      >
        <div className="mb-6">
          <h1 className="text-lg font-semibold">Yoink</h1>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {railItems.map((item, index) => {
            const active = isRailItemActive(item, location);
            const Icon = railIcon(item);
            const key = railItemKey(item);
            const listsHeading = shouldShowListsHeadingBefore(item, railItems[index - 1]) ? (
              <div
                data-rail-heading="lists"
                className="mt-3 px-3 pb-1 text-xs font-medium text-muted-foreground"
              >
                Lists
              </div>
            ) : null;

            if (item.kind === 'new-list') {
              return (
                <Fragment key={key}>
                  {listsHeading}
                  <Button
                    type="button"
                    variant="ghost"
                    data-rail-item="new-list"
                    data-rail-label={item.label}
                    className={cn(railClassName(false), 'h-auto w-full justify-start font-normal')}
                    onClick={() => setCreateListOpen(true)}
                  >
                    <Icon className="h-5 w-5" />
                    <span>+ {item.label}</span>
                  </Button>
                </Fragment>
              );
            }

            if (item.kind === 'inbox') {
              return (
                <Link
                  key={key}
                  to="/"
                  data-rail-item="inbox"
                  data-rail-label={item.label}
                  className={railClassName(active)}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 truncate">{item.label}</span>
                  {shouldShowInboxCount(item.count) ? (
                    <span data-inbox-count={item.count} className="ml-auto text-xs tabular-nums">
                      {item.count}
                    </span>
                  ) : null}
                </Link>
              );
            }

            if (item.kind === 'named') {
              return (
                <Fragment key={key}>
                  {listsHeading}
                  <div
                    className={cn(
                      'flex min-w-0 items-center rounded-md',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Link
                      to="/tasks"
                      search={railTaskSearch(item)}
                      data-rail-item="named"
                      data-rail-label={item.label}
                      data-rail-list-id={item.listId}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm transition-colors',
                        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </Link>
                    {railItemHasOverflow(item) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            data-rail-overflow={item.label}
                            data-rail-overflow-list-id={item.listId}
                            aria-label={`More for ${item.label}`}
                            className="mr-1 shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="right" sideOffset={4} avoidCollisions={false}>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => {
                              // Let the kit menu close before the same-kit dialog opens.
                              window.setTimeout(() => {
                                setDeletingList({ id: item.listId, name: item.label });
                              }, 0);
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </Fragment>
              );
            }

            return (
              <Fragment key={key}>
                {listsHeading}
                <Link
                  to="/tasks"
                  search={railTaskSearch(item)}
                  data-rail-item={item.kind === 'smart' ? item.key : item.kind}
                  data-rail-label={item.label}
                  className={railClassName(active)}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              </Fragment>
            );
          })}
        </div>
      </nav>

      <CreateNamedListDialog
        open={createListOpen}
        onOpenChange={setCreateListOpen}
        onCreated={(list) => {
          void navigate({
            to: '/tasks',
            search: { filter: 'all', pile: list.id },
          });
        }}
      />

      <DeleteNamedListDialog
        list={deletingList}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingList(null);
          }
        }}
        onDeleted={() => {
          if (
            deletingList &&
            location.pathname === '/tasks' &&
            location.filter === 'all' &&
            location.pile === deletingList.id
          ) {
            void navigate({
              to: '/tasks',
              search: { filter: 'all' },
            });
          }
        }}
      />
    </>
  );
}
