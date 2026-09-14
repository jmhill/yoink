import { Fragment, useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Separator } from '@yoink/ui-base/components/separator';
import { cn } from '@yoink/ui-base/lib/utils';
import {
  Calendar,
  CalendarClock,
  CheckCheck,
  Inbox,
  List,
  Plus,
  User,
} from 'lucide-react';
import { tsr, tsrLists } from '@/api/client';
import { CreateNamedListDialog } from '@/components/create-named-list-dialog';
import { DeleteNamedListDialog } from '@/components/delete-named-list-dialog';
import { NamedListRailOverflow } from '@/components/named-list-rail-overflow';
import {
  INBOX_MODE_CUE,
  RAIL_LABEL_WRAP_CLASS,
  RAIL_LISTS_HEADING,
  RAIL_TASK_FAMILY_HEADING,
  buildAppRailItems,
  isRailItemActive,
  railItemHasOverflow,
  railItemKey,
  shouldShowInboxCount,
  shouldShowListsHeadingBefore,
  shouldShowTaskFamilyHeadingBefore,
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
  onDestinationChosen?: () => void;
};

const RAIL_SECTION_HEADING_CLASS =
  'px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground';

/**
 * Approved rail costume: Inbox first as capture/triage **mode** (count
 * hidden at 0), loud split, Task family (Today → Done), Lists heading,
 * named lists, Unlisted last, + New list. Desktop is the left sidebar.
 * Mobile lives in the Tasks swipe drawer.
 */
export function AppRailPanel({
  surface,
  className,
  showBrand = false,
  onDestinationChosen,
}: AppRailPanelProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const searchRecord = search && typeof search === 'object' ? search : {};
  const [createListOpen, setCreateListOpen] = useState(false);
  const [createListKey, setCreateListKey] = useState(0);
  const [deletingList, setDeletingList] = useState<{ id: string; name: string } | null>(null);

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
      'flex min-w-0 items-start gap-3 rounded-md px-3 py-2 text-sm transition-colors',
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto">
          {railItems.map((item, index) => {
            const active = isRailItemActive(item, location);
            const Icon = railIcon(item);
            const key = railItemKey(item);
            const taskFamilyHeading = shouldShowTaskFamilyHeadingBefore(
              item,
              railItems[index - 1]
            ) ? (
              <>
                <Separator
                  data-rail-separator="inbox-to-task-family"
                  className="mx-1 my-3 bg-border"
                />
                <div data-rail-heading="task-family" className={RAIL_SECTION_HEADING_CLASS}>
                  {RAIL_TASK_FAMILY_HEADING}
                </div>
              </>
            ) : null;
            const listsHeading = shouldShowListsHeadingBefore(item, railItems[index - 1]) ? (
              <>
                <Separator
                  data-rail-separator="task-family-to-lists"
                  className="mx-1 my-3 bg-border"
                />
                <div data-rail-heading="lists" className={RAIL_SECTION_HEADING_CLASS}>
                  {RAIL_LISTS_HEADING}
                </div>
              </>
            ) : null;

            if (item.kind === 'new-list') {
              return (
                <Fragment key={key}>
                  {taskFamilyHeading}
                  {listsHeading}
                  <Button
                    type="button"
                    variant="ghost"
                    data-rail-item="new-list"
                    data-rail-label={item.label}
                    className={cn(
                      railClassName(false),
                      'mt-1 h-auto w-full justify-start whitespace-normal border border-dashed border-border font-normal'
                    )}
                    onClick={openCreateList}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
                      + {item.label}
                    </span>
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
                  data-rail-mode="inbox"
                  data-rail-label={item.label}
                  data-rail-active={active ? 'true' : undefined}
                  className={cn(
                    'flex min-w-0 flex-col rounded-lg bg-inbox-surface text-sm transition-colors',
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={active ? onDestinationChosen : undefined}
                >
                  <span className="flex min-w-0 items-start gap-3 px-3 py-2">
                    <Icon className="h-5 w-5 shrink-0" />
                    <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
                      {item.label}
                    </span>
                    {shouldShowInboxCount(item.count) ? (
                      <span
                        data-inbox-count={item.count}
                        className="ml-auto shrink-0 rounded-full bg-background px-2 py-0.5 text-xs tabular-nums text-foreground"
                      >
                        {item.count}
                      </span>
                    ) : null}
                  </span>
                  <span
                    data-rail-mode-cue=""
                    className="px-3 pb-2 text-xs leading-snug text-muted-foreground"
                  >
                    {INBOX_MODE_CUE}
                  </span>
                </Link>
              );
            }

            if (item.kind === 'named') {
              return (
                <Fragment key={key}>
                  {taskFamilyHeading}
                  {listsHeading}
                  <div
                    className={cn(
                      'flex min-w-0 items-start rounded-md',
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
                        'flex min-w-0 flex-1 items-start gap-3 px-3 py-2 text-sm transition-colors',
                        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={active ? onDestinationChosen : undefined}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
                        {item.label}
                      </span>
                    </Link>
                    {railItemHasOverflow(item) ? (
                      <NamedListRailOverflow
                        surface={surface}
                        listId={item.listId}
                        label={item.label}
                        onDelete={() => {
                          setDeletingList({ id: item.listId, name: item.label });
                        }}
                      />
                    ) : null}
                  </div>
                </Fragment>
              );
            }

            return (
              <Fragment key={key}>
                {taskFamilyHeading}
                {listsHeading}
                <Link
                  to="/tasks"
                  search={railTaskSearch(item)}
                  data-rail-item={item.kind === 'smart' ? item.key : item.kind}
                  data-rail-label={item.label}
                  data-rail-active={active ? 'true' : undefined}
                  className={railClassName(active)}
                  onClick={active ? onDestinationChosen : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
                    {item.label}
                  </span>
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
