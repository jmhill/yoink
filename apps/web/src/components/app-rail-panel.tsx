import { Fragment, useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
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
import { namedPileSearch, todaySearch, unlistedPileSearch } from '@/lib/all-tasks-piles';

export type AppRailSurface = 'desktop' | 'mobile-tasks';

type TaskFilterSearch = 'today' | 'upcoming' | 'mine' | 'completed';

const SMART_VIEW_FILTER: Record<
  Extract<RailItem, { kind: 'smart' }>['key'],
  TaskFilterSearch
> = {
  today: 'today',
  upcoming: 'upcoming',
  mine: 'mine',
  done: 'completed',
};

const railIcon = (item: RailItem) => {
  if (item.kind === 'inbox') return Inbox;
  if (item.kind === 'unlisted' || item.kind === 'named') return List;
  if (item.kind === 'new-list') return Plus;
  if (item.key === 'today') return Calendar;
  if (item.key === 'upcoming') return CalendarClock;
  if (item.key === 'mine') return User;
  return CheckCheck;
};

const railTaskSearch = (
  item: Extract<RailItem, { kind: 'smart' } | { kind: 'named' } | { kind: 'unlisted' }>
): { filter: TaskFilterSearch } | { pile: string } => {
  if (item.kind === 'smart') {
    return { filter: SMART_VIEW_FILTER[item.key] };
  }
  if (item.kind === 'named') {
    return namedPileSearch(item.listId);
  }
  return unlistedPileSearch();
};

type AppRailPanelProps = {
  surface: AppRailSurface;
  className?: string;
  showBrand?: boolean;
};

/**
 * Approved flat rail: Inbox (count hidden at 0), Today / Upcoming / Mine / Done,
 * Lists heading, named lists, Unlisted last, + New list.
 * Desktop is the left sidebar. Mobile lives inside the Tasks tab.
 */
export function AppRailPanel({ surface, className, showBrand = false }: AppRailPanelProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const searchRecord = search && typeof search === 'object' ? search : {};
  const [createListOpen, setCreateListOpen] = useState(false);
  const [createListKey, setCreateListKey] = useState(0);
  const [deletingList, setDeletingList] = useState<{ id: string; name: string } | null>(null);
  const overflowSide = surface === 'desktop' ? 'right' : 'bottom';

  const openCreateList = () => {
    setCreateListKey((key) => key + 1);
    setCreateListOpen(true);
  };

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

  const railClassName = (active: boolean) =>
    cn(
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
      active
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    );

  return (
    <>
      <nav
        data-app-rail=""
        data-app-rail-surface={surface}
        aria-label="App rail"
        className={className}
      >
        {showBrand ? (
          <div className="mb-6">
            <h1 className="text-lg font-semibold">Yoink</h1>
          </div>
        ) : null}
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
                    onClick={openCreateList}
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
                  data-rail-active={active ? 'true' : undefined}
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
                      data-rail-active={active ? 'true' : undefined}
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
                        <DropdownMenuContent
                          align="start"
                          side={overflowSide}
                          sideOffset={4}
                          avoidCollisions={surface === 'mobile-tasks'}
                        >
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
                  data-rail-active={active ? 'true' : undefined}
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
        key={`${surface}-${createListKey}`}
        open={createListOpen}
        onOpenChange={setCreateListOpen}
        onCreated={(list) => {
          void navigate({
            to: '/tasks',
            search: namedPileSearch(list.id),
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
            location.filter === undefined &&
            location.pile === deletingList.id
          ) {
            void navigate({
              to: '/tasks',
              search: todaySearch(),
            });
          }
        }}
      />
    </>
  );
}
