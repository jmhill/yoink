import { Fragment, useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Separator } from '@yoink/ui-base/components/separator';
import { cn } from '@yoink/ui-base/lib/utils';
import {
  Calendar,
  CalendarClock,
  CheckCheck,
  CircleDot,
  FolderKanban,
  Inbox,
  List,
  Plus,
  User,
} from 'lucide-react';
import { tsr, tsrLists, tsrProjects, tsrWork } from '@/api/client';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { CreateNamedListDialog } from '@/components/create-named-list-dialog';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { DeleteNamedListDialog } from '@/components/delete-named-list-dialog';
import { NamedListRailOverflow } from '@/components/named-list-rail-overflow';
import { NamedListRenameField } from '@/components/named-list-rename-field';
import {
  INBOX_MODE_CUE,
  RAIL_LABEL_WRAP_CLASS,
  RAIL_LISTS_HEADING,
  RAIL_PROJECTS_HEADING,
  RAIL_SOMEDAY_HEADING,
  RAIL_TASK_FAMILY_HEADING,
  activeDesktopRailRow,
  buildAppRailItems,
  buildDesktopRailSections,
  isRailItemActive,
  railItemHasOverflow,
  railItemKey,
  shouldShowInboxCount,
  shouldShowListsHeadingBefore,
  shouldShowProjectsHeadingBefore,
  shouldShowTaskFamilyHeadingBefore,
  type DesktopRailSection,
  type RailItem,
  type RailLocation,
} from '@/lib/app-rail';
import { namedPileSearch, todaySearch, unlistedPileSearch } from '@/lib/all-tasks-piles';
import { MOBILE_TABS, type MobileTabKey } from '@/lib/mobile-tabs';

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

const RAIL_ICON_CLASS = 'h-5 w-5 shrink-0';

const renderRailIcon = (item: RailItem) => {
  if (item.kind === 'inbox') return <Inbox className={RAIL_ICON_CLASS} />;
  if (item.kind === 'now') return <CircleDot className={RAIL_ICON_CLASS} />;
  if (item.kind === 'unlisted' || item.kind === 'named') return <List className={RAIL_ICON_CLASS} />;
  if (item.kind === 'new-list' || item.kind === 'new-project') {
    return <Plus className={RAIL_ICON_CLASS} />;
  }
  if (item.kind === 'project' || item.kind === 'someday-project') {
    return <FolderKanban className={RAIL_ICON_CLASS} />;
  }
  if (item.key === 'today') return <Calendar className={RAIL_ICON_CLASS} />;
  if (item.key === 'upcoming') return <CalendarClock className={RAIL_ICON_CLASS} />;
  if (item.key === 'mine') return <User className={RAIL_ICON_CLASS} />;
  return <CheckCheck className={RAIL_ICON_CLASS} />;
};

const CaptureTabIcon = MOBILE_TABS[0].icon;
const ProcessTabIcon = MOBILE_TABS[1].icon;
const WorkTabIcon = MOBILE_TABS[2].icon;
const ReviewTabIcon = MOBILE_TABS[3].icon;

const renderSectionIcon = (key: MobileTabKey) => {
  if (key === 'capture') return <CaptureTabIcon className={RAIL_ICON_CLASS} />;
  if (key === 'process') return <ProcessTabIcon className={RAIL_ICON_CLASS} />;
  if (key === 'work') return <WorkTabIcon className={RAIL_ICON_CLASS} />;
  return <ReviewTabIcon className={RAIL_ICON_CLASS} />;
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

const SECTION_SEPARATOR: Record<MobileTabKey, string | null> = {
  capture: null,
  process: 'capture-to-process',
  work: 'process-to-work',
  review: 'work-to-review',
};

type RailRowShared = {
  surface: AppRailSurface;
  location: RailLocation;
  railClassName: (active: boolean) => string;
  isActive: (item: RailItem) => boolean;
  onDestinationChosen?: () => void;
  listOpenCounts: Map<string, number>;
  unlistedOpenCount: number | undefined;
  renamingListId: string | null;
  onRenameStart: (listId: string) => void;
  onRenameEnd: () => void;
  onDelete: (list: { id: string; name: string }) => void;
  onCreateList: () => void;
  onCreateProject: () => void;
  indentClass: string;
};

const RailNewListRow = ({ shared }: { shared: RailRowShared }) => {
  return (
    <Button
      type="button"
      variant="ghost"
      data-rail-item="new-list"
      data-rail-label="New list"
      className={cn(
        shared.railClassName(false),
        shared.indentClass,
        'mt-1 h-auto w-full justify-start whitespace-normal border border-dashed border-border font-normal'
      )}
      onClick={shared.onCreateList}
    >
      {renderRailIcon({ kind: 'new-list', label: 'New list' })}
      <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
        + New list
      </span>
    </Button>
  );
};

const RailNewProjectRow = ({ shared }: { shared: RailRowShared }) => {
  return (
    <Button
      type="button"
      variant="ghost"
      data-rail-item="new-project"
      data-rail-label="New project"
      className={cn(
        shared.railClassName(false),
        shared.indentClass,
        'mt-1 h-auto w-full justify-start whitespace-normal border border-dashed border-border font-normal'
      )}
      onClick={shared.onCreateProject}
    >
      {renderRailIcon({ kind: 'new-project', label: 'New project' })}
      <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
        + New project
      </span>
    </Button>
  );
};

const RailProjectRow = ({
  item,
  shared,
}: {
  item: Extract<RailItem, { kind: 'project' }>;
  shared: RailRowShared;
}) => {
  const active = shared.isActive(item);
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: item.projectId }}
      data-rail-item="project"
      data-rail-label={item.label}
      data-rail-project-id={item.projectId}
      data-rail-active={active ? 'true' : undefined}
      className={cn(shared.railClassName(active), shared.indentClass)}
      onClick={active ? shared.onDestinationChosen : undefined}
    >
      {renderRailIcon(item)}
      <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
        {item.label}
      </span>
      {item.missingNextAction ? (
        <span
          data-rail-no-next-action=""
          aria-label="No next action"
          className="ml-auto mt-1.5 size-1.5 shrink-0 rounded-full bg-warning"
        />
      ) : null}
    </Link>
  );
};

const RailSomedayGroup = ({
  items,
  shared,
}: {
  items: Extract<RailItem, { kind: 'someday-project' }>[];
  shared: RailRowShared;
}) => (
  <details data-rail-someday-group="" className={cn('min-w-0', shared.indentClass)}>
    <summary
      data-rail-someday-summary=""
      className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
    >
      {RAIL_SOMEDAY_HEADING}
    </summary>
    {items.map((someday) => {
      const somedayActive = shared.isActive(someday);
      return (
        <Link
          key={someday.projectId}
          to="/projects/$projectId"
          params={{ projectId: someday.projectId }}
          data-rail-item="someday-project"
          data-rail-label={someday.label}
          data-rail-project-id={someday.projectId}
          data-rail-active={somedayActive ? 'true' : undefined}
          className={shared.railClassName(somedayActive)}
          onClick={somedayActive ? shared.onDestinationChosen : undefined}
        >
          {renderRailIcon(someday)}
          <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
            {someday.label}
          </span>
        </Link>
      );
    })}
  </details>
);

const RailNamedRow = ({
  item,
  shared,
}: {
  item: Extract<RailItem, { kind: 'named' }>;
  shared: RailRowShared;
}) => {
  const active = shared.isActive(item);
  return (
    <div
      className={cn(
        'flex min-w-0 items-center rounded-md',
        shared.indentClass,
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {shared.renamingListId === item.listId ? (
        <div
          data-rail-item="named"
          data-rail-label={item.label}
          data-rail-list-id={item.listId}
          data-rail-active={active ? 'true' : undefined}
          className="flex min-w-0 flex-1 items-start"
        >
          <NamedListRenameField
            listId={item.listId}
            currentName={item.label}
            onCancel={shared.onRenameEnd}
            onRenamed={shared.onRenameEnd}
          />
        </div>
      ) : (
        <>
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
            onClick={active ? shared.onDestinationChosen : undefined}
          >
            {renderRailIcon(item)}
            <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
              {item.label}
            </span>
          </Link>
          {shared.listOpenCounts.has(item.listId) ? (
            <span
              data-rail-list-count={item.listId}
              className="shrink-0 pr-1 tabular-nums text-xs text-muted-foreground"
            >
              {shared.listOpenCounts.get(item.listId)}
            </span>
          ) : null}
          {railItemHasOverflow(item) ? (
            <NamedListRailOverflow
              surface={shared.surface}
              listId={item.listId}
              label={item.label}
              onRename={() => {
                shared.onRenameStart(item.listId);
              }}
              onDelete={() => {
                shared.onDelete({ id: item.listId, name: item.label });
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
};

const RailTaskLinkRow = ({
  item,
  shared,
}: {
  item: Extract<RailItem, { kind: 'smart' } | { kind: 'unlisted' } | { kind: 'now' }>;
  shared: RailRowShared;
}) => {
  const active = shared.isActive(item);
  if (item.kind === 'now') {
    return (
      <Link
        to="/work"
        data-rail-item="now"
        data-rail-label={item.label}
        data-rail-active={active ? 'true' : undefined}
        className={cn(shared.railClassName(active), shared.indentClass)}
        onClick={active ? shared.onDestinationChosen : undefined}
      >
        {renderRailIcon(item)}
        <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
          {item.label}
        </span>
      </Link>
    );
  }
  return (
    <div className={cn('flex min-w-0 items-center', shared.indentClass)}>
      <Link
        to="/tasks"
        search={railTaskSearch(item)}
        data-rail-item={item.kind === 'smart' ? item.key : item.kind}
        data-rail-label={item.label}
        data-rail-active={active ? 'true' : undefined}
        className={cn(shared.railClassName(active), 'flex-1')}
        onClick={active ? shared.onDestinationChosen : undefined}
      >
        {renderRailIcon(item)}
        <span data-rail-label-text="" className={RAIL_LABEL_WRAP_CLASS}>
          {item.label}
        </span>
      </Link>
      {item.kind === 'unlisted' && shared.unlistedOpenCount !== undefined ? (
        <span
          data-rail-list-count="unlisted"
          className="shrink-0 pr-1 tabular-nums text-xs text-muted-foreground"
        >
          {shared.unlistedOpenCount}
        </span>
      ) : null}
    </div>
  );
};

const RailInboxModeRow = ({
  item,
  shared,
}: {
  item: Extract<RailItem, { kind: 'inbox' }>;
  shared: RailRowShared;
}) => {
  const active = shared.isActive(item);
  return (
    <Link
      to="/"
      data-rail-item="inbox"
      data-rail-mode="inbox"
      data-rail-label={item.label}
      data-rail-active={active ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-col rounded-lg bg-inbox-surface text-sm transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={active ? shared.onDestinationChosen : undefined}
    >
      <span className="flex min-w-0 items-start gap-3 px-3 py-2">
        {renderRailIcon(item)}
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
};

const DesktopSectionRow = ({
  section,
  active,
  onDestinationChosen,
  railClassName,
}: {
  section: DesktopRailSection;
  active: boolean;
  onDestinationChosen?: () => void;
  railClassName: (active: boolean) => string;
}) => {
  return (
    <Link
      to={section.to}
      data-rail-item="section"
      data-rail-section={section.key}
      data-rail-label={section.label}
      data-rail-active={active ? 'true' : undefined}
      className={cn(railClassName(active), 'font-medium')}
      onClick={active ? onDestinationChosen : undefined}
    >
      {renderSectionIcon(section.key)}
      <span data-rail-label-text="" className="min-w-0 shrink-0 whitespace-nowrap">
        {section.label}
      </span>
      {section.badge !== null ? (
        <span
          data-inbox-count={section.badge}
          className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums text-foreground"
        >
          {section.badge}
        </span>
      ) : null}
    </Link>
  );
};

const renderChildItem = (
  item: RailItem,
  shared: RailRowShared,
  somedayItems: Extract<RailItem, { kind: 'someday-project' }>[]
) => {
  if (item.kind === 'new-list') {
    return <RailNewListRow shared={shared} />;
  }
  if (item.kind === 'new-project') {
    return <RailNewProjectRow shared={shared} />;
  }
  if (item.kind === 'project') {
    return <RailProjectRow item={item} shared={shared} />;
  }
  if (item.kind === 'someday-project') {
    if (somedayItems[0] !== item) {
      return null;
    }
    return <RailSomedayGroup items={somedayItems} shared={shared} />;
  }
  if (item.kind === 'named') {
    return <RailNamedRow item={item} shared={shared} />;
  }
  if (item.kind === 'inbox') {
    return <RailInboxModeRow item={item} shared={shared} />;
  }
  return <RailTaskLinkRow item={item} shared={shared} />;
};

function DesktopRailSections({
  sections,
  shared,
  railClassName,
  onDestinationChosen,
}: {
  sections: DesktopRailSection[];
  shared: RailRowShared;
  railClassName: (active: boolean) => string;
  onDestinationChosen?: () => void;
}) {
  const activeRow = activeDesktopRailRow(shared.location);
  return (
    <>
      {sections.map((section) => {
        const separator = SECTION_SEPARATOR[section.key];
        const somedayItems = section.items.filter(
          (item): item is Extract<RailItem, { kind: 'someday-project' }> =>
            item.kind === 'someday-project'
        );
        const listsStart = section.items.findIndex(
          (item) => item.kind === 'named' || item.kind === 'unlisted' || item.kind === 'new-list'
        );
        return (
          <Fragment key={section.key}>
            {separator ? (
              <Separator data-rail-separator={separator} className="mx-1 my-3 bg-border" />
            ) : null}
            <DesktopSectionRow
              section={section}
              active={activeRow === section.key}
              onDestinationChosen={onDestinationChosen}
              railClassName={railClassName}
            />
            {section.items.map((item, index) => (
              <Fragment key={railItemKey(item)}>
                {section.key === 'work' && index === listsStart && listsStart >= 0 ? (
                  <div
                    data-rail-heading="lists"
                    className={cn(RAIL_SECTION_HEADING_CLASS, 'pl-7 pt-2')}
                  >
                    {RAIL_LISTS_HEADING}
                  </div>
                ) : null}
                {renderChildItem(item, shared, somedayItems)}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

function MobileTasksRailItems({
  items,
  shared,
}: {
  items: RailItem[];
  shared: RailRowShared;
}) {
  const somedayItems = items.filter(
    (item): item is Extract<RailItem, { kind: 'someday-project' }> =>
      item.kind === 'someday-project'
  );
  return (
    <>
      {items.map((item, index) => {
        const previous = items[index - 1];
        const taskFamilyHeading = shouldShowTaskFamilyHeadingBefore(item, previous) ? (
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
        const listsHeading = shouldShowListsHeadingBefore(item, previous) ? (
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
        const projectsHeading = shouldShowProjectsHeadingBefore(item, previous) ? (
          <>
            <Separator
              data-rail-separator="lists-to-projects"
              className="mx-1 my-3 bg-border"
            />
            <div data-rail-heading="projects" className={RAIL_SECTION_HEADING_CLASS}>
              {RAIL_PROJECTS_HEADING}
            </div>
          </>
        ) : null;
        return (
          <Fragment key={railItemKey(item)}>
            {taskFamilyHeading}
            {listsHeading}
            {projectsHeading}
            {renderChildItem(item, shared, somedayItems)}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Desktop is four section rows (Capture, Process, Work, Review).
 * The phone Work drawer keeps the flat Inbox / Task family / Lists /
 * Projects list from `buildAppRailItems`.
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
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createProjectKey, setCreateProjectKey] = useState(0);
  const [deletingList, setDeletingList] = useState<{ id: string; name: string } | null>(null);
  const [renamingListId, setRenamingListId] = useState<string | null>(null);

  const openCreateList = () => {
    setCreateListKey((key) => key + 1);
    setCreateListOpen(true);
  };

  const openCreateProject = () => {
    setCreateProjectKey((key) => key + 1);
    setCreateProjectOpen(true);
  };

  const { data: inboxData } = tsr.list.useQuery({
    queryKey: ['captures', 'inbox'],
    queryData: { query: { status: 'inbox' as const, snoozed: false, limit: PILE_SAFETY_CAP } },
  });
  const { data: listsData } = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
  });
  const { data: projectsData } = tsrProjects.list.useQuery({
    queryKey: ['projects'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
  });
  const { data: workListsData } = tsrWork.listLists.useQuery({
    queryKey: ['work', 'lists'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
  });

  const inboxCount = inboxData?.status === 200 ? inboxData.body.total : 0;
  const namedLists = listsData?.status === 200 ? listsData.body.lists : [];
  const projects = projectsData?.status === 200 ? projectsData.body.projects : [];
  const listOpenCounts = new Map(
    workListsData?.status === 200
      ? workListsData.body.lists.map((list) => [list.id, list.openTaskCount])
      : []
  );
  const unlistedOpenCount =
    workListsData?.status === 200 ? workListsData.body.unlisted.openTaskCount : undefined;
  const drawerItems = buildAppRailItems({ inboxCount, namedLists, projects });
  const desktopSections = buildDesktopRailSections({ inboxCount, namedLists, projects });
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
  const activeRow = activeDesktopRailRow(location);

  const railClassName = (active: boolean) =>
    cn(
      'flex min-w-0 items-start gap-3 rounded-md px-3 py-2 text-sm transition-colors',
      active
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    );

  const shared: RailRowShared = {
    surface,
    location,
    railClassName,
    isActive:
      surface === 'desktop'
        ? (item) => activeRow === railItemKey(item)
        : (item) => isRailItemActive(item, location),
    onDestinationChosen,
    listOpenCounts,
    unlistedOpenCount,
    renamingListId,
    onRenameStart: setRenamingListId,
    onRenameEnd: () => setRenamingListId(null),
    onDelete: setDeletingList,
    onCreateList: openCreateList,
    onCreateProject: openCreateProject,
    indentClass: surface === 'desktop' ? 'pl-6' : '',
  };

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
          {surface === 'desktop' ? (
            <DesktopRailSections
              sections={desktopSections}
              shared={shared}
              railClassName={railClassName}
              onDestinationChosen={onDestinationChosen}
            />
          ) : (
            <MobileTasksRailItems items={drawerItems} shared={shared} />
          )}
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

      <CreateProjectDialog
        key={`${surface}-project-${createProjectKey}`}
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(project) => {
          void navigate({
            to: '/projects/$projectId',
            params: { projectId: project.id },
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
