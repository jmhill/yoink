import { createFileRoute, redirect, useSearch, useNavigate } from '@tanstack/react-router';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { z } from 'zod';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { Tabs, TabsList, TabsTrigger } from '@yoink/ui-base/components/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@yoink/ui-base/components/select';
import { tsrTasks, tsr, tsrLists } from '@/api/client';
import {
  cancelLiveQueries,
  invalidateLiveQueries,
  isBlockingQueryFailure,
  mapLiveOpenTaskLists,
  restoreQuerySnapshots,
  snapshotLiveOpenTaskLists,
} from '@/lib/live-query';
import { getSession, listMembers, memberLabel, type Member } from '@/api/auth';
import { isFetchError } from '@ts-rest/react-query/v5';
import { CheckSquare, Calendar, CalendarClock, List, CheckCheck, AlertCircle, User } from 'lucide-react';
import { Header } from '@/components/header';
import { MobileTasksRailDrawer } from '@/components/mobile-tasks-rail-drawer';
import { PlaceHeading } from '@/components/place-heading';
import { ErrorState } from '@/components/error-state';
import { TaskCard } from '@/components/task-card';
import { SortablePileList } from '@/components/sortable-pile-list';
import { TaskEditModal } from '@/components/task-edit-modal';
import { AnimatedList, AnimatedListItem, type ExitDirection } from '@/components/animated-list';
import { toast } from 'sonner';
import { PILE_SAFETY_CAP, TaskFilterSchema, type TaskFilter, type Task } from '@yoink/api-contracts';
import {
  LoadMoreButton,
  isTaskHistoryData,
  mapTaskHistoryPageItems,
  useCompletedTaskPages,
} from '@/lib/use-history-pages';
import {
  ALL_PILE_OVERVIEW,
  ALL_PILE_UNLISTED,
  groupAllTasksByPile,
  listIdForCreateTask,
  parsePileScreen,
  showsCreateTaskListPicker,
  tasksBoardLanding,
  tasksBoardSearchEquals,
  type AllPileGroup,
  type NamedListRef,
} from '@/lib/all-tasks-piles';
import { TASK_SURFACE_TEST_ID } from '@/lib/inbox-pane';
import {
  TASK_PLACE_SUBCOPY_TEST_ID,
  taskPlaceFromBoard,
  taskPlaceHeading,
  taskPlaceSubcopy,
} from '@/lib/task-place';

/**
 * Helper to get today's date in YYYY-MM-DD format
 */
const getTodayStr = () => new Date().toISOString().split('T')[0];

/**
 * Split tasks into overdue and due today for the Today view
 */
const splitTodayTasks = (tasks: Task[]): { overdue: Task[]; dueToday: Task[] } => {
  const todayStr = getTodayStr();
  const overdue: Task[] = [];
  const dueToday: Task[] = [];

  for (const task of tasks) {
    if (task.dueDate && task.dueDate < todayStr) {
      overdue.push(task);
    } else {
      dueToday.push(task);
    }
  }

  return { overdue, dueToday };
};

const searchSchema = z.object({
  filter: TaskFilterSchema.optional(),
  pile: z.union([z.literal(ALL_PILE_OVERVIEW), z.literal(ALL_PILE_UNLISTED), z.string().uuid()]).optional(),
});

const UNKNOWN_LIST_ID = '00000000-0000-0000-0000-000000000000';

export const Route = createFileRoute('/_authenticated/tasks')({
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    const next = tasksBoardLanding(search);
    if (!tasksBoardSearchEquals(search, next)) {
      throw redirect({
        to: '/tasks',
        search: next,
      });
    }
  },
  component: TasksPage,
});

type TodayTaskListProps = {
  tasks: Task[];
  namedLists: NamedListRef[];
  exitDirections: Record<string, ExitDirection>;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onEdit: (task: Task) => void;
  isLoading: boolean;
  assigneeLabel: (task: Task) => string | undefined;
  listLabel: (task: Task) => string | undefined;
};

/**
 * Today is a deadline view: overdue vs due today on the outside, then
 * named list plus unlisted inside each. No reorder.
 */
function TodayTaskList({
  tasks,
  namedLists,
  exitDirections,
  onComplete,
  onUncomplete,
  onEdit,
  isLoading,
  assigneeLabel,
  listLabel,
}: TodayTaskListProps) {
  const { overdue, dueToday } = splitTodayTasks(tasks);
  const overdueGroups = groupAllTasksByPile(overdue, namedLists);
  const dueTodayGroups = groupAllTasksByPile(dueToday, namedLists);

  const renderPileTasks = (group: AllPileGroup) => (
    <AnimatedList>
      {group.tasks.map((task) => (
        <AnimatedListItem
          key={task.id}
          id={task.id}
          exitDirection={exitDirections[task.id] ?? 'right'}
        >
          <TaskCard
            task={task}
            onComplete={onComplete}
            onUncomplete={onUncomplete}
            onEdit={onEdit}
            isLoading={isLoading}
            assigneeLabel={assigneeLabel(task)}
            listLabel={listLabel(task)}
          />
        </AnimatedListItem>
      ))}
    </AnimatedList>
  );

  return (
    <div className="space-y-6">
      {overdueGroups.length > 0 && (
        <div data-today-section="overdue">
          <div className="mb-2 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Overdue</span>
          </div>
          <PileGroupList groups={overdueGroups}>{renderPileTasks}</PileGroupList>
        </div>
      )}

      {dueTodayGroups.length > 0 && (
        <div data-today-section="due-today">
          <div className="mb-2 flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">Due Today</span>
          </div>
          <PileGroupList groups={dueTodayGroups}>{renderPileTasks}</PileGroupList>
        </div>
      )}
    </div>
  );
}

type PileGroupListProps = {
  groups: AllPileGroup[];
  children: (group: AllPileGroup) => ReactNode;
};

/**
 * Named-list (plus unlisted) groups for overview views. Only piles with
 * tasks in the current result set are shown. No reorder.
 */
function PileGroupList({ groups, children }: PileGroupListProps) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div
          key={group.key}
          data-pile-group={group.kind}
          data-pile-name={group.name}
        >
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <List className="h-4 w-4" />
            <span className="text-sm font-medium">{group.name}</span>
          </div>
          {children(group)}
        </div>
      ))}
    </div>
  );
}

/** Radix Select forbids an empty item value; map to/from the unlisted create state. */
const UNLISTED_VALUE = 'unlisted';

function TasksPage() {
  const { filter, pile } = useSearch({ from: '/_authenticated/tasks' });
  const navigate = useNavigate();
  const boardFilter: TaskFilter = filter ?? 'today';
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskListId, setNewTaskListId] = useState('');
  const [exitDirections, setExitDirections] = useState<Record<string, ExitDirection>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const tsrQueryClient = tsrTasks.useQueryClient();
  const tsrListsQueryClient = tsrLists.useQueryClient();
  const allPile = parsePileScreen(pile);
  const namedPileId = allPile?.kind === 'named' ? allPile.listId : undefined;
  const showsPileGroups =
    allPile === null &&
    (boardFilter === 'today' || boardFilter === 'upcoming' || boardFilter === 'mine');

  const { data: sourceCaptureData, isPending: isLoadingCapture } = tsr.get.useQuery({
    queryKey: ['capture', editingTask?.captureId ?? ''],
    queryData: { params: { id: editingTask?.captureId ?? '' } },
    enabled: !!editingTask?.captureId,
    refetchInterval: false,
  });
  const sourceCapture = sourceCaptureData?.status === 200 ? sourceCaptureData.body : null;

  useEffect(() => {
    const loadMembers = async () => {
      const session = await getSession();
      if (!session.ok) return;
      setCurrentUserId(session.data.user.id);
      const result = await listMembers(session.data.organizationId);
      if (result.ok) {
        setMembers(result.data.members);
      }
    };
    loadMembers();
  }, []);

  useEffect(() => {
    setIsReordering(false);
  }, [pile, filter]);

  const assigneeLabelFor = (task: Task): string | undefined => {
    if (!task.assigneeId) return undefined;
    const member = members.find((m) => m.userId === task.assigneeId);
    return member ? memberLabel(member) : task.assigneeId;
  };

  const { data: listsData, isPending: listsPending } = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
  });
  const namedLists = listsData?.status === 200 ? listsData.body.lists : [];
  const namedPileList =
    allPile?.kind === 'named'
      ? namedLists.find((list) => list.id === allPile.listId)
      : undefined;
  const namedPileMissing =
    allPile?.kind === 'named' &&
    listsData?.status === 200 &&
    !namedPileList;

  const listLabelFor = (task: Task): string | undefined => {
    if (!task.listId) return undefined;
    const list = namedLists.find((item) => item.id === task.listId);
    return list ? list.name : undefined;
  };

  const boardQueryEnabled = allPile === null;
  const completedBoard = boardQueryEnabled && boardFilter === 'completed';
  const liveBoard = boardQueryEnabled && boardFilter !== 'completed';
  const { data, isPending, error, refetch } = tsrTasks.list.useQuery({
    queryKey: ['tasks', boardFilter],
    queryData: { query: { filter: boardFilter, limit: PILE_SAFETY_CAP } },
    enabled: liveBoard,
  });
  const completedPages = useCompletedTaskPages(completedBoard);

  const {
    data: namedPileData,
    isPending: namedPilePending,
    error: namedPileError,
    refetch: refetchNamedPile,
  } = tsrLists.listOpenTasks.useQuery({
    queryKey: ['lists', namedPileId ?? 'none', 'tasks'],
    queryData: {
      params: { id: namedPileId ?? UNKNOWN_LIST_ID },
      query: { limit: PILE_SAFETY_CAP },
    },
    enabled: Boolean(namedPileId) && !namedPileMissing,
  });

  const {
    data: unlistedPileData,
    isPending: unlistedPilePending,
    error: unlistedPileError,
    refetch: refetchUnlistedPile,
  } = tsrLists.listUnlistedOpenTasks.useQuery({
    queryKey: ['unlisted', 'tasks'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
    enabled: allPile?.kind === 'unlisted',
  });

  const reorderNamedMutation = tsrLists.reorderOpenTasks.useMutation({
    onMutate: async ({ body }) => {
      await cancelLiveQueries(tsrQueryClient);
      if (!namedPileId) {
        return {};
      }
      const queryKey = ['lists', namedPileId, 'tasks'];
      const previous = tsrListsQueryClient.getQueryData(queryKey);
      if (previous && typeof previous === 'object' && 'status' in previous) {
        const current = previous as { status: number; body: { tasks: Task[] } };
        if (current.status === 200) {
          const byId = new Map(current.body.tasks.map((task) => [task.id, task]));
          const tasks = body.taskIds
            .map((id) => byId.get(id))
            .filter((task): task is Task => task !== undefined);
          tsrListsQueryClient.setQueryData(queryKey, {
            ...current,
            body: { ...current.body, tasks },
          });
        }
      }
      return { previous, queryKey };
    },
    onSuccess: (result) => {
      if (result.status === 200 && namedPileId) {
        tsrListsQueryClient.setQueryData(['lists', namedPileId, 'tasks'], result);
      }
      toast.success('Order updated');
    },
    onError: (err, _variables, context) => {
      if (context?.queryKey) {
        tsrListsQueryClient.setQueryData(context.queryKey, context.previous);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error('Failed to change order');
    },
    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const reorderUnlistedMutation = tsrLists.reorderUnlistedOpenTasks.useMutation({
    onMutate: async ({ body }) => {
      await cancelLiveQueries(tsrQueryClient);
      const queryKey = ['unlisted', 'tasks'];
      const previous = tsrListsQueryClient.getQueryData(queryKey);
      if (previous && typeof previous === 'object' && 'status' in previous) {
        const current = previous as { status: number; body: { tasks: Task[] } };
        if (current.status === 200) {
          const byId = new Map(current.body.tasks.map((task) => [task.id, task]));
          const tasks = body.taskIds
            .map((id) => byId.get(id))
            .filter((task): task is Task => task !== undefined);
          tsrListsQueryClient.setQueryData(queryKey, {
            ...current,
            body: { ...current.body, tasks },
          });
        }
      }
      return { previous, queryKey };
    },
    onSuccess: (result) => {
      if (result.status === 200) {
        tsrListsQueryClient.setQueryData(['unlisted', 'tasks'], result);
      }
      toast.success('Order updated');
    },
    onError: (err, _variables, context) => {
      if (context?.queryKey) {
        tsrListsQueryClient.setQueryData(context.queryKey, context.previous);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error('Failed to change order');
    },
    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const displayedTasksQueryKey = (): string[] => {
    if (namedPileId) {
      return ['lists', namedPileId, 'tasks'];
    }
    if (allPile?.kind === 'unlisted') {
      return ['unlisted', 'tasks'];
    }
    return ['tasks', boardFilter];
  };

  // Create task mutation
  const createMutation = tsrTasks.create.useMutation({
    onMutate: async ({ body }) => {
      await cancelLiveQueries(tsrQueryClient);
      const queryKey = displayedTasksQueryKey();
      const previousTasks = tsrQueryClient.getQueryData(queryKey);

      // Create optimistic task with unique ID to avoid collisions
      const optimisticTask: Task = {
        id: `temp-${crypto.randomUUID()}`,
        organizationId: 'temp',
        createdById: 'temp',
        title: body.title,
        dueDate: body.dueDate,
        createdAt: new Date().toISOString(),
        lastChangedAt: new Date().toISOString(),
        lastChangedBy: null,
        completedBy: null,
        ...(body.assigneeId ? { assigneeId: body.assigneeId } : {}),
        ...(body.listId ? { listId: body.listId } : {}),
      };

      if (previousTasks && typeof previousTasks === 'object' && 'status' in previousTasks) {
        const current = previousTasks as { status: number; body: { tasks: Task[] } };
        if (current.status === 200) {
          tsrQueryClient.setQueryData(queryKey, {
            ...current,
            body: {
              ...current.body,
              tasks: [optimisticTask, ...current.body.tasks],
              total:
                ('total' in current.body && typeof current.body.total === 'number'
                  ? current.body.total
                  : current.body.tasks.length) + 1,
            },
          });
        }
      }

      setNewTaskTitle('');
      return { previousTasks, queryKey, previousTitle: body.title };
    },

    onError: (err, _variables, context) => {
      if (context?.queryKey) {
        tsrQueryClient.setQueryData(context.queryKey, context.previousTasks);
      }
      if (context?.previousTitle) {
        setNewTaskTitle(context.previousTitle);
      }

      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to create task');
      }
    },

    onSuccess: () => {
      toast.success('Task created');
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
  });

  // Complete mutation
  const completeMutation = tsrTasks.complete.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(tsrQueryClient);
      const previous = snapshotLiveOpenTaskLists(tsrQueryClient);
      mapLiveOpenTaskLists(tsrQueryClient, (tasks) =>
        tasks.filter((task) => task.id !== params.id)
      );
      return { previous };
    },

    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(tsrQueryClient, context.previous);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to complete task');
      }
    },

    onSuccess: () => {
      toast.success('Task completed');
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  // Uncomplete mutation
  const uncompleteMutation = tsrTasks.uncomplete.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(tsrQueryClient);
      const queryKey = displayedTasksQueryKey();
      const previousTasks = tsrQueryClient.getQueryData(queryKey);

      if (completedBoard) {
        if (isTaskHistoryData(previousTasks)) {
          tsrQueryClient.setQueryData(
            queryKey,
            mapTaskHistoryPageItems(previousTasks, (items) =>
              items.filter((task) => task.id !== params.id)
            )
          );
        }
        return { previousTasks, queryKey };
      }

      if (previousTasks && typeof previousTasks === 'object' && 'status' in previousTasks) {
        const current = previousTasks as { status: number; body: { tasks: Task[] } };
        if (current.status === 200) {
          tsrQueryClient.setQueryData(queryKey, {
            ...current,
            body: {
              ...current.body,
              tasks: current.body.tasks.map((task) =>
                task.id === params.id ? { ...task, completedAt: undefined } : task
              ),
            },
          });
        }
      }

      return { previousTasks, queryKey };
    },

    onError: (err, _variables, context) => {
      if (context?.queryKey) {
        tsrQueryClient.setQueryData(context.queryKey, context.previousTasks);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to uncomplete task');
      }
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  // Delete mutation
  const deleteMutation = tsrTasks.delete.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(tsrQueryClient);
      const previous = snapshotLiveOpenTaskLists(tsrQueryClient);
      const completedKey = ['tasks', 'completed'] as const;
      const previousCompleted = tsrQueryClient.getQueryData(completedKey);
      mapLiveOpenTaskLists(tsrQueryClient, (tasks) =>
        tasks.filter((task) => task.id !== params.id)
      );
      if (isTaskHistoryData(previousCompleted)) {
        tsrQueryClient.setQueryData(
          completedKey,
          mapTaskHistoryPageItems(previousCompleted, (items) =>
            items.filter((task) => task.id !== params.id)
          )
        );
      }
      return { previous, previousCompleted, completedKey };
    },

    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(tsrQueryClient, context.previous);
      }
      if (context?.completedKey) {
        tsrQueryClient.setQueryData(context.completedKey, context.previousCompleted);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to delete task');
      }
    },

    onSuccess: () => {
      toast.success('Task deleted');
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  // Update mutation
  const updateMutation = tsrTasks.update.useMutation({
    onMutate: async ({ params, body }) => {
      await cancelLiveQueries(tsrQueryClient);
      const previous = snapshotLiveOpenTaskLists(tsrQueryClient);
      const displayedKey = displayedTasksQueryKey();
      mapLiveOpenTaskLists(tsrQueryClient, (tasks, queryKey) =>
        tasks.flatMap((task) => {
          if (task.id !== params.id) {
            return [task];
          }
          const nextListId = body?.listId === null ? undefined : body?.listId ?? task.listId;
          const keyMatches =
            queryKey.length === displayedKey.length &&
            queryKey.every((part, index) => part === displayedKey[index]);
          const leftNamedPile =
            Boolean(namedPileId) && keyMatches && nextListId !== namedPileId;
          const leftUnlisted =
            allPile?.kind === 'unlisted' && keyMatches && Boolean(nextListId);
          if (leftNamedPile || leftUnlisted) {
            return [];
          }
          return [
            {
              ...task,
              title: body?.title ?? task.title,
              dueDate: body?.dueDate === null ? undefined : body?.dueDate ?? task.dueDate,
              assigneeId:
                body?.assigneeId === null ? undefined : body?.assigneeId ?? task.assigneeId,
              listId: body?.listId === null ? undefined : nextListId,
            },
          ];
        })
      );
      return { previous };
    },

    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(tsrQueryClient, context.previous);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to update task');
      }
    },

    onSuccess: () => {
      toast.success('Task updated');
      setEditingTask(null);
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    // Get today's date for "today" filter tasks
    const dueDate = boardFilter === 'today' && !allPile ? new Date().toISOString().split('T')[0] : undefined;
    const assigneeId = boardFilter === 'mine' && !allPile ? currentUserId : undefined;

    const listId = listIdForCreateTask({ allPile, pickedListId: newTaskListId });

    createMutation.mutate({
      body: {
        title: newTaskTitle.trim(),
        dueDate,
        ...(assigneeId ? { assigneeId } : {}),
        ...(listId ? { listId } : {}),
      },
    });
  };

  const handleComplete = (id: string) => {
    completeMutation.mutate({ params: { id }, body: {} });
  };

  const handleUncomplete = (id: string) => {
    uncompleteMutation.mutate({ params: { id }, body: {} });
  };

  const handleDelete = (id: string) => {
    setExitDirections((prev) => ({ ...prev, [id]: 'right' }));
    deleteMutation.mutate({ params: { id } });
    setDeleteConfirmId(null);
  };

  const handleFilterChange = (newFilter: string) => {
    navigate({
      to: '/tasks',
      search: { filter: newFilter as Exclude<TaskFilter, 'all'> },
    });
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
  };

  const handleSaveEdit = (taskId: string, updates: { title?: string; dueDate?: string | null; assigneeId?: string | null; listId?: string | null }) => {
    updateMutation.mutate({
      params: { id: taskId },
      body: updates,
    });
  };

  const boardTasks = completedBoard
    ? completedPages.items
    : data?.status === 200
      ? data.body.tasks
      : [];
  const namedPileTasks = namedPileData?.status === 200 ? namedPileData.body.tasks : [];
  const unlistedPileTasks = unlistedPileData?.status === 200 ? unlistedPileData.body.tasks : [];
  const canReorder = allPile?.kind === 'named' || allPile?.kind === 'unlisted';
  const tasks =
    allPile?.kind === 'named'
      ? namedPileTasks
      : allPile?.kind === 'unlisted'
        ? unlistedPileTasks
        : boardTasks;
  const pileGroups =
    allPile === null && (boardFilter === 'upcoming' || boardFilter === 'mine')
      ? groupAllTasksByPile(boardTasks, namedLists)
      : [];

  const activeData =
    allPile?.kind === 'named'
      ? namedPileData
      : allPile?.kind === 'unlisted'
        ? unlistedPileData
        : completedBoard
          ? completedPages.data
          : data;
  const activeError =
    allPile?.kind === 'named'
      ? namedPileMissing
        ? null
        : namedPileError
      : allPile?.kind === 'unlisted'
        ? unlistedPileError
        : completedBoard
          ? completedPages.error
          : error;
  const blockingError = isBlockingQueryFailure(activeError, activeData)
    ? activeError
    : null;
  const activePending =
    allPile?.kind === 'named'
      ? listsPending || (!namedPileMissing && namedPilePending)
      : allPile?.kind === 'unlisted'
        ? unlistedPilePending
        : completedBoard
          ? completedPages.isPending
          : isPending || (showsPileGroups && listsPending);
  const refetchActive = () => {
    if (allPile?.kind === 'named') {
      void refetchNamedPile();
      return;
    }
    if (allPile?.kind === 'unlisted') {
      void refetchUnlistedPile();
      return;
    }
    if (completedBoard) {
      void completedPages.refetch();
      return;
    }
    void refetch();
  };
  const displayedCount =
    allPile?.kind === 'named'
      ? namedPileData?.status === 200
        ? namedPileData.body.total
        : namedPileTasks.length
      : allPile?.kind === 'unlisted'
        ? unlistedPileData?.status === 200
          ? unlistedPileData.body.total
          : unlistedPileTasks.length
        : completedBoard
          ? completedPages.total
          : data?.status === 200
            ? data.body.total
            : boardTasks.length;

  const reorderPending = reorderNamedMutation.isPending || reorderUnlistedMutation.isPending;
  const isLoading =
    createMutation.isPending ||
    completeMutation.isPending ||
    uncompleteMutation.isPending ||
    deleteMutation.isPending ||
    reorderPending;

  const persistPileOrder = (taskIds: string[]) => {
    if (allPile?.kind === 'named') {
      reorderNamedMutation.mutate({
        params: { id: allPile.listId },
        body: { taskIds },
      });
      return;
    }
    if (allPile?.kind === 'unlisted') {
      reorderUnlistedMutation.mutate({
        body: { taskIds },
      });
    }
  };

  const emptyTitle =
    allPile?.kind === 'named'
      ? 'No open tasks on this list'
      : allPile?.kind === 'unlisted'
        ? 'No open unlisted tasks'
        : boardFilter === 'today'
          ? 'No tasks for today'
          : boardFilter === 'upcoming'
            ? 'No upcoming tasks'
            : boardFilter === 'mine'
              ? 'No tasks assigned to you'
              : boardFilter === 'completed'
                ? 'No completed tasks'
                : 'No tasks yet';

  const emptyHint =
    allPile?.kind === 'named' || allPile?.kind === 'unlisted'
      ? 'Open tasks in this pile will appear here'
      : boardFilter === 'today'
        ? 'Add a task above or process a capture'
        : boardFilter === 'upcoming'
          ? 'Tasks with future due dates will appear here'
          : boardFilter === 'mine'
            ? 'Add a task above or assign one to yourself'
            : boardFilter === 'completed'
              ? 'Complete a task to see it here'
              : 'Create your first task above';

  const place = taskPlaceFromBoard({
    pile: allPile,
    filter: boardFilter,
    namedListName: namedPileList?.name,
  });

  return (
    <div
      data-testid={TASK_SURFACE_TEST_ID}
      data-task-surface=""
      className="container mx-auto max-w-2xl bg-background p-4"
    >
      <Header leading={<MobileTasksRailDrawer />} />
      <PlaceHeading
        title={isReordering ? 'Reorder' : taskPlaceHeading(place)}
        subcopy={taskPlaceSubcopy(place, displayedCount)}
        subcopyTestId={TASK_PLACE_SUBCOPY_TEST_ID}
        action={
          canReorder && tasks.length > 0 ? (
            isReordering ? (
              <Button
                type="button"
                variant="secondary"
                data-reorder-done=""
                onClick={() => setIsReordering(false)}
              >
                Done
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                data-reorder-enter=""
                onClick={() => setIsReordering(true)}
              >
                Reorder
              </Button>
            )
          ) : null
        }
      />

      <Tabs value={filter ?? 'none'} onValueChange={handleFilterChange} className="mb-6 hidden md:block">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="today" className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="truncate">Today</span>
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline truncate">Upcoming</span>
            <span className="sm:hidden truncate">Soon</span>
          </TabsTrigger>
          <TabsTrigger value="mine" className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
            <User className="h-4 w-4 shrink-0" />
            <span className="truncate">Mine</span>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
            <CheckCheck className="h-4 w-4 shrink-0" />
            <span className="truncate">Done</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {boardFilter !== 'completed' && (
        <form onSubmit={handleQuickAdd} className="mb-6">
          <div className="flex gap-2">
            <Input
              id="create-task-title"
              ref={inputRef}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={`Add task${boardFilter === 'today' && !allPile ? ' for today' : ''}...`}
              disabled={createMutation.isPending}
              className="flex-1"
            />
            {showsCreateTaskListPicker(allPile) ? (
              <Select
                value={newTaskListId || UNLISTED_VALUE}
                onValueChange={(value) =>
                  setNewTaskListId(value === UNLISTED_VALUE ? '' : value)
                }
                disabled={createMutation.isPending}
              >
                <SelectTrigger id="create-task-list" className="w-[9.5rem] shrink-0 sm:w-[12rem]">
                  <SelectValue placeholder="No list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNLISTED_VALUE}>No list</SelectItem>
                  {namedLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button type="submit" disabled={createMutation.isPending || !newTaskTitle.trim()}>
              {createMutation.isPending ? '...' : 'Add'}
            </Button>
          </div>
        </form>
      )}

      {blockingError ? (
        <ErrorState error={blockingError} onRetry={() => refetchActive()} />
      ) : activePending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : namedPileMissing ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <List className="mx-auto mb-2 h-8 w-8" />
            <p>List not found</p>
          </CardContent>
        </Card>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {boardFilter === 'completed' && !allPile ? (
              <CheckCheck className="mx-auto mb-2 h-8 w-8" />
            ) : (
              <CheckSquare className="mx-auto mb-2 h-8 w-8" />
            )}
            <p>{emptyTitle}</p>
            <p className="text-sm">{emptyHint}</p>
          </CardContent>
        </Card>
      ) : allPile === null && boardFilter === 'today' ? (
        <TodayTaskList
          tasks={tasks}
          namedLists={namedLists}
          exitDirections={exitDirections}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          onEdit={handleEdit}
          isLoading={isLoading}
          assigneeLabel={assigneeLabelFor}
          listLabel={listLabelFor}
        />
      ) : allPile === null && (boardFilter === 'upcoming' || boardFilter === 'mine') ? (
        <PileGroupList groups={pileGroups}>
          {(group) => (
            <AnimatedList>
              {group.tasks.map((task) => (
                <AnimatedListItem
                  key={task.id}
                  id={task.id}
                  exitDirection={exitDirections[task.id] ?? 'right'}
                >
                  <TaskCard
                    task={task}
                    onComplete={handleComplete}
                    onUncomplete={handleUncomplete}
                    onEdit={handleEdit}
                    isLoading={isLoading}
                    assigneeLabel={assigneeLabelFor(task)}
                    listLabel={listLabelFor(task)}
                  />
                </AnimatedListItem>
              ))}
            </AnimatedList>
          )}
        </PileGroupList>
      ) : (
        canReorder ? (
          <SortablePileList
            tasks={tasks}
            disabled={isLoading}
            onPersistOrder={persistPileOrder}
            renderTask={(task, dragHandle) => (
              <TaskCard
                task={task}
                onComplete={handleComplete}
                onUncomplete={handleUncomplete}
                onEdit={handleEdit}
                isLoading={isLoading}
                assigneeLabel={assigneeLabelFor(task)}
                listLabel={listLabelFor(task)}
                dragHandle={dragHandle}
                reorderMode={isReordering}
              />
            )}
          />
        ) : (
        <>
        <AnimatedList>
          {tasks.map((task) => (
            <AnimatedListItem
              key={task.id}
              id={task.id}
              exitDirection={exitDirections[task.id] ?? 'right'}
            >
              <TaskCard
                task={task}
                onComplete={handleComplete}
                onUncomplete={handleUncomplete}
                onEdit={handleEdit}
                isLoading={isLoading}
                assigneeLabel={assigneeLabelFor(task)}
                listLabel={listLabelFor(task)}
              />
            </AnimatedListItem>
          ))}
        </AnimatedList>
        {completedBoard ? (
          <LoadMoreButton
            hasNextPage={Boolean(completedPages.hasNextPage)}
            isFetchingNextPage={completedPages.isFetchingNextPage}
            onLoadMore={() => void completedPages.fetchNextPage()}
          />
        ) : null}
        </>
        )
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This task will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task edit modal */}
      <TaskEditModal
        open={editingTask !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTask(null);
          }
        }}
        task={editingTask}
        sourceCapture={sourceCapture}
        onSave={handleSaveEdit}
        onDelete={(id) => {
          setEditingTask(null);
          setDeleteConfirmId(id);
        }}
        isLoading={updateMutation.isPending}
        isLoadingCapture={isLoadingCapture}
        members={members.map((m) => ({ userId: m.userId, label: memberLabel(m) }))}
        lists={namedLists.map((list) => ({ id: list.id, name: list.name }))}
      />
    </div>
  );
}
