import { createFileRoute, useSearch, useNavigate } from '@tanstack/react-router';
import { useState, useRef, useEffect } from 'react';
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@yoink/ui-base/components/select';
import { tsrTasks, tsr, tsrLists } from '@/api/client';
import { getSession, listMembers, memberLabel, type Member } from '@/api/auth';
import { isFetchError } from '@ts-rest/react-query/v5';
import { CheckSquare, Calendar, CalendarClock, List, CheckCheck, AlertCircle, User } from 'lucide-react';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';
import { TaskCard, type TaskReorderControls } from '@/components/task-card';
import { TaskEditModal } from '@/components/task-edit-modal';
import { CreateNamedListDialog } from '@/components/create-named-list-dialog';
import { AnimatedList, AnimatedListItem, type ExitDirection } from '@/components/animated-list';
import { toast } from 'sonner';
import { TaskFilterSchema, type TaskFilter, type Task } from '@yoink/api-contracts';
import {
  ALL_PILE_NEW_LIST,
  ALL_PILE_OVERVIEW,
  ALL_PILE_UNLISTED,
  allPileSelectValue,
  groupAllTasksByPile,
  parseAllPile,
  type AllPile,
} from '@/lib/all-tasks-piles';

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
  filter: TaskFilterSchema.default('today'),
  pile: z.union([z.literal(ALL_PILE_OVERVIEW), z.literal(ALL_PILE_UNLISTED), z.string().uuid()]).optional(),
});

const UNKNOWN_LIST_ID = '00000000-0000-0000-0000-000000000000';

export const Route = createFileRoute('/_authenticated/tasks')({
  validateSearch: searchSchema,
  component: TasksPage,
});

type TodayTaskListProps = {
  tasks: Task[];
  exitDirections: Record<string, ExitDirection>;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  isLoading: boolean;
  assigneeLabel: (task: Task) => string | undefined;
  listLabel: (task: Task) => string | undefined;
};

/**
 * Renders the Today view with overdue tasks grouped separately at the top
 */
function TodayTaskList({
  tasks,
  exitDirections,
  onComplete,
  onUncomplete,
  onPin,
  onUnpin,
  onDelete,
  onEdit,
  isLoading,
  assigneeLabel,
  listLabel,
}: TodayTaskListProps) {
  const { overdue, dueToday } = splitTodayTasks(tasks);

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Overdue</span>
          </div>
          <AnimatedList>
            {overdue.map((task) => (
              <AnimatedListItem
                key={task.id}
                id={task.id}
                exitDirection={exitDirections[task.id] ?? 'right'}
              >
                <TaskCard
                  task={task}
                  onComplete={onComplete}
                  onUncomplete={onUncomplete}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  isLoading={isLoading}
                  assigneeLabel={assigneeLabel(task)}
                  listLabel={listLabel(task)}
                />
              </AnimatedListItem>
            ))}
          </AnimatedList>
        </div>
      )}

      {dueToday.length > 0 && (
        <div>
          {overdue.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">Due Today</span>
            </div>
          )}
          <AnimatedList>
            {dueToday.map((task) => (
              <AnimatedListItem
                key={task.id}
                id={task.id}
                exitDirection={exitDirections[task.id] ?? 'right'}
              >
                <TaskCard
                  task={task}
                  onComplete={onComplete}
                  onUncomplete={onUncomplete}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  isLoading={isLoading}
                  assigneeLabel={assigneeLabel(task)}
                  listLabel={listLabel(task)}
                />
              </AnimatedListItem>
            ))}
          </AnimatedList>
        </div>
      )}
    </div>
  );
}

/** Radix Select forbids an empty item value; map to/from the unlisted create state. */
const UNLISTED_VALUE = 'unlisted';

function TasksPage() {
  const { filter, pile } = useSearch({ from: '/_authenticated/tasks' });
  const navigate = useNavigate();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskListId, setNewTaskListId] = useState('');
  const [exitDirections, setExitDirections] = useState<Record<string, ExitDirection>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [createListOpen, setCreateListOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const tsrQueryClient = tsrTasks.useQueryClient();
  const tsrListsQueryClient = tsrLists.useQueryClient();
  const allPile: AllPile | null = filter === 'all' ? parseAllPile(pile) : null;
  const namedPileId = allPile?.kind === 'named' ? allPile.listId : undefined;

  const { data: sourceCaptureData, isFetching: isFetchingCapture } = tsr.get.useQuery({
    queryKey: ['capture', editingTask?.captureId ?? ''],
    queryData: { params: { id: editingTask?.captureId ?? '' } },
    enabled: !!editingTask?.captureId,
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

  const assigneeLabelFor = (task: Task): string | undefined => {
    if (!task.assigneeId) return undefined;
    const member = members.find((m) => m.userId === task.assigneeId);
    return member ? memberLabel(member) : task.assigneeId;
  };

  const { data: listsData, isPending: listsPending } = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: {},
  });
  const namedLists = listsData?.status === 200 ? listsData.body.lists : [];
  const namedPileMissing =
    allPile?.kind === 'named' &&
    listsData?.status === 200 &&
    !namedLists.some((list) => list.id === allPile.listId);

  const listLabelFor = (task: Task): string | undefined => {
    if (!task.listId) return undefined;
    const list = namedLists.find((item) => item.id === task.listId);
    return list ? list.name : undefined;
  };

  const boardQueryEnabled = allPile === null || allPile.kind === 'overview';
  const { data, isPending, error, refetch } = tsrTasks.list.useQuery({
    queryKey: ['tasks', filter],
    queryData: { query: { filter: filter as TaskFilter } },
    enabled: boardQueryEnabled,
  });

  const {
    data: namedPileData,
    isPending: namedPilePending,
    error: namedPileError,
    refetch: refetchNamedPile,
  } = tsrLists.listOpenTasks.useQuery({
    queryKey: ['lists', namedPileId ?? 'none', 'tasks'],
    queryData: { params: { id: namedPileId ?? UNKNOWN_LIST_ID } },
    enabled: Boolean(namedPileId) && !namedPileMissing,
  });

  const {
    data: unlistedPileData,
    isPending: unlistedPilePending,
    error: unlistedPileError,
    refetch: refetchUnlistedPile,
  } = tsrLists.listUnlistedOpenTasks.useQuery({
    queryKey: ['unlisted', 'tasks'],
    queryData: {},
    enabled: allPile?.kind === 'unlisted',
  });

  const invalidateTaskViews = () => {
    tsrQueryClient.invalidateQueries({ queryKey: ['tasks'] });
    tsrListsQueryClient.invalidateQueries({ queryKey: ['lists'] });
    tsrListsQueryClient.invalidateQueries({ queryKey: ['unlisted'] });
  };

  const reorderNamedMutation = tsrLists.reorderOpenTasks.useMutation({
    onSuccess: (result) => {
      if (result.status === 200 && namedPileId) {
        tsrListsQueryClient.setQueryData(['lists', namedPileId, 'tasks'], result);
      }
      toast.success('Order updated');
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error('Failed to change order');
    },
    onSettled: () => {
      if (namedPileId) {
        tsrListsQueryClient.invalidateQueries({ queryKey: ['lists', namedPileId, 'tasks'] });
      }
    },
  });

  const reorderUnlistedMutation = tsrLists.reorderUnlistedOpenTasks.useMutation({
    onSuccess: (result) => {
      if (result.status === 200) {
        tsrListsQueryClient.setQueryData(['unlisted', 'tasks'], result);
      }
      toast.success('Order updated');
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error('Failed to change order');
    },
    onSettled: () => {
      tsrListsQueryClient.invalidateQueries({ queryKey: ['unlisted', 'tasks'] });
    },
  });

  // Create task mutation
  const createMutation = tsrTasks.create.useMutation({
    onMutate: async ({ body }) => {
      await tsrQueryClient.cancelQueries({ queryKey: ['tasks'] });

      const previousTasks = tsrQueryClient.list.getQueryData(['tasks', filter]);

      // Create optimistic task with unique ID to avoid collisions
      const optimisticTask: Task = {
        id: `temp-${crypto.randomUUID()}`,
        organizationId: 'temp',
        createdById: 'temp',
        title: body.title,
        dueDate: body.dueDate,
        createdAt: new Date().toISOString(),
        ...(body.assigneeId ? { assigneeId: body.assigneeId } : {}),
        ...(body.listId ? { listId: body.listId } : {}),
      };

      if (previousTasks?.status === 200) {
        tsrQueryClient.list.setQueryData(['tasks', filter], {
          ...previousTasks,
          body: {
            ...previousTasks.body,
            tasks: [optimisticTask, ...previousTasks.body.tasks],
          },
        });
      }

      setNewTaskTitle('');
      return { previousTasks, previousTitle: body.title };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTasks) {
        tsrQueryClient.list.setQueryData(['tasks', filter], context.previousTasks);
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
      invalidateTaskViews();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
  });

  // Complete mutation
  const completeMutation = tsrTasks.complete.useMutation({
    onMutate: async ({ params }) => {
      await tsrQueryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = tsrQueryClient.list.getQueryData(['tasks', filter]);

      if (previousTasks?.status === 200) {
        tsrQueryClient.list.setQueryData(['tasks', filter], {
          ...previousTasks,
          body: {
            ...previousTasks.body,
            tasks: previousTasks.body.tasks.map((t) =>
              t.id === params.id ? { ...t, completedAt: new Date().toISOString() } : t
            ),
          },
        });
      }

      return { previousTasks };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTasks) {
        tsrQueryClient.list.setQueryData(['tasks', filter], context.previousTasks);
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
      invalidateTaskViews();
    },
  });

  // Uncomplete mutation
  const uncompleteMutation = tsrTasks.uncomplete.useMutation({
    onMutate: async ({ params }) => {
      await tsrQueryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = tsrQueryClient.list.getQueryData(['tasks', filter]);

      if (previousTasks?.status === 200) {
        tsrQueryClient.list.setQueryData(['tasks', filter], {
          ...previousTasks,
          body: {
            ...previousTasks.body,
            tasks: previousTasks.body.tasks.map((t) =>
              t.id === params.id ? { ...t, completedAt: undefined } : t
            ),
          },
        });
      }

      return { previousTasks };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTasks) {
        tsrQueryClient.list.setQueryData(['tasks', filter], context.previousTasks);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to uncomplete task');
      }
    },

    onSettled: () => {
      invalidateTaskViews();
    },
  });

  // Pin mutation
  const pinMutation = tsrTasks.pin.useMutation({
    onMutate: async ({ params }) => {
      await tsrQueryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = tsrQueryClient.list.getQueryData(['tasks', filter]);

      if (previousTasks?.status === 200) {
        tsrQueryClient.list.setQueryData(['tasks', filter], {
          ...previousTasks,
          body: {
            ...previousTasks.body,
            tasks: previousTasks.body.tasks.map((t) =>
              t.id === params.id ? { ...t, pinnedAt: new Date().toISOString() } : t
            ),
          },
        });
      }

      return { previousTasks };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTasks) {
        tsrQueryClient.list.setQueryData(['tasks', filter], context.previousTasks);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to pin task');
      }
    },

    onSuccess: () => {
      toast.success('Task pinned');
    },

    onSettled: () => {
      invalidateTaskViews();
    },
  });

  // Unpin mutation
  const unpinMutation = tsrTasks.unpin.useMutation({
    onMutate: async ({ params }) => {
      await tsrQueryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = tsrQueryClient.list.getQueryData(['tasks', filter]);

      if (previousTasks?.status === 200) {
        tsrQueryClient.list.setQueryData(['tasks', filter], {
          ...previousTasks,
          body: {
            ...previousTasks.body,
            tasks: previousTasks.body.tasks.map((t) =>
              t.id === params.id ? { ...t, pinnedAt: undefined } : t
            ),
          },
        });
      }

      return { previousTasks };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTasks) {
        tsrQueryClient.list.setQueryData(['tasks', filter], context.previousTasks);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to unpin task');
      }
    },

    onSettled: () => {
      invalidateTaskViews();
    },
  });

  // Delete mutation
  const deleteMutation = tsrTasks.delete.useMutation({
    onMutate: async ({ params }) => {
      await tsrQueryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = tsrQueryClient.list.getQueryData(['tasks', filter]);

      if (previousTasks?.status === 200) {
        tsrQueryClient.list.setQueryData(['tasks', filter], {
          ...previousTasks,
          body: {
            ...previousTasks.body,
            tasks: previousTasks.body.tasks.filter((t) => t.id !== params.id),
          },
        });
      }

      return { previousTasks };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTasks) {
        tsrQueryClient.list.setQueryData(['tasks', filter], context.previousTasks);
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
      invalidateTaskViews();
      // Also invalidate captures since deleting a task may delete its source capture
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });

  // Update mutation
  const updateMutation = tsrTasks.update.useMutation({
    onMutate: async ({ params, body }) => {
      await tsrQueryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = tsrQueryClient.list.getQueryData(['tasks', filter]);

      if (previousTasks?.status === 200 && body) {
        tsrQueryClient.list.setQueryData(['tasks', filter], {
          ...previousTasks,
          body: {
            ...previousTasks.body,
            tasks: previousTasks.body.tasks.map((t) =>
              t.id === params.id
                ? {
                    ...t,
                    title: body.title ?? t.title,
                    dueDate: body.dueDate === null ? undefined : body.dueDate ?? t.dueDate,
                    assigneeId: body.assigneeId === null ? undefined : body.assigneeId ?? t.assigneeId,
                    listId: body.listId === null ? undefined : body.listId ?? t.listId,
                  }
                : t
            ),
          },
        });
      }

      return { previousTasks };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTasks) {
        tsrQueryClient.list.setQueryData(['tasks', filter], context.previousTasks);
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
      invalidateTaskViews();
    },
  });

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    // Get today's date for "today" filter tasks
    const dueDate = filter === 'today' ? new Date().toISOString().split('T')[0] : undefined;
    const assigneeId = filter === 'mine' ? currentUserId : undefined;

    createMutation.mutate({
      body: {
        title: newTaskTitle.trim(),
        dueDate,
        ...(assigneeId ? { assigneeId } : {}),
        ...(newTaskListId ? { listId: newTaskListId } : {}),
      },
    });
  };

  const handleComplete = (id: string) => {
    completeMutation.mutate({ params: { id }, body: {} });
  };

  const handleUncomplete = (id: string) => {
    uncompleteMutation.mutate({ params: { id }, body: {} });
  };

  const handlePin = (id: string) => {
    pinMutation.mutate({ params: { id }, body: {} });
  };

  const handleUnpin = (id: string) => {
    unpinMutation.mutate({ params: { id }, body: {} });
  };

  const handleDelete = (id: string) => {
    setExitDirections((prev) => ({ ...prev, [id]: 'right' }));
    deleteMutation.mutate({ params: { id } });
    setDeleteConfirmId(null);
  };

  const handleFilterChange = (newFilter: string) => {
    navigate({
      to: '/tasks',
      search: { filter: newFilter as TaskFilter },
    });
  };

  const handlePileChange = (value: string) => {
    if (value === ALL_PILE_NEW_LIST) {
      requestAnimationFrame(() => setCreateListOpen(true));
      return;
    }
    navigate({
      to: '/tasks',
      search: {
        filter: 'all',
        ...(value === ALL_PILE_OVERVIEW ? {} : { pile: value }),
      },
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

  const boardTasks = data?.status === 200 ? data.body.tasks : [];
  const namedPileTasks = namedPileData?.status === 200 ? namedPileData.body.tasks : [];
  const unlistedPileTasks = unlistedPileData?.status === 200 ? unlistedPileData.body.tasks : [];
  const canReorder = allPile?.kind === 'named' || allPile?.kind === 'unlisted';
  const tasks =
    allPile?.kind === 'named'
      ? namedPileTasks
      : allPile?.kind === 'unlisted'
        ? unlistedPileTasks
        : boardTasks;
  const overviewGroups =
    allPile?.kind === 'overview' ? groupAllTasksByPile(boardTasks, namedLists) : [];

  const activeError =
    allPile?.kind === 'named'
      ? namedPileMissing
        ? null
        : namedPileError
      : allPile?.kind === 'unlisted'
        ? unlistedPileError
        : error;
  const activePending =
    allPile?.kind === 'named'
      ? listsPending || (!namedPileMissing && namedPilePending)
      : allPile?.kind === 'unlisted'
        ? unlistedPilePending
        : allPile?.kind === 'overview'
          ? isPending || listsPending
          : isPending;
  const refetchActive = () => {
    if (allPile?.kind === 'named') {
      void refetchNamedPile();
      return;
    }
    if (allPile?.kind === 'unlisted') {
      void refetchUnlistedPile();
      return;
    }
    void refetch();
  };

  const reorderPending = reorderNamedMutation.isPending || reorderUnlistedMutation.isPending;
  const isLoading =
    createMutation.isPending ||
    completeMutation.isPending ||
    uncompleteMutation.isPending ||
    pinMutation.isPending ||
    unpinMutation.isPending ||
    deleteMutation.isPending ||
    reorderPending;

  const movePileTask = (taskId: string, direction: 'up' | 'down') => {
    const index = tasks.findIndex((item) => item.id === taskId);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= tasks.length) return;
    const next = [...tasks];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    const taskIds = next.map((item) => item.id);
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

  const reorderFor = (index: number): TaskReorderControls | undefined => {
    if (!canReorder) return undefined;
    return {
      canMoveUp: index > 0,
      canMoveDown: index < tasks.length - 1,
      onMove: movePileTask,
    };
  };

  const emptyTitle =
    filter === 'today'
      ? 'No tasks for today'
      : filter === 'upcoming'
        ? 'No upcoming tasks'
        : filter === 'mine'
          ? 'No tasks assigned to you'
          : filter === 'completed'
            ? 'No completed tasks'
            : allPile?.kind === 'named'
              ? 'No open tasks on this list'
              : allPile?.kind === 'unlisted'
                ? 'No open unlisted tasks'
                : 'No tasks yet';

  const emptyHint =
    filter === 'today'
      ? 'Add a task above or process a capture'
      : filter === 'upcoming'
        ? 'Tasks with future due dates will appear here'
        : filter === 'mine'
          ? 'Add a task above or assign one to yourself'
          : filter === 'completed'
            ? 'Complete a task to see it here'
            : allPile?.kind === 'named' || allPile?.kind === 'unlisted'
              ? 'Open tasks in this pile will appear here'
              : 'Create your first task above';

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header viewName="Tasks" />

      <Tabs value={filter} onValueChange={handleFilterChange} className="mb-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="today" className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="truncate">Today</span>
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline truncate">Upcoming</span>
            <span className="sm:hidden truncate">Soon</span>
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
            <List className="h-4 w-4 shrink-0" />
            <span className="truncate">All</span>
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

      {allPile && (
        <div className="mb-4">
          <Select value={allPileSelectValue(allPile)} onValueChange={handlePileChange}>
            <SelectTrigger id="all-pile" aria-label="Pile" className="w-full sm:w-[16rem]">
              <SelectValue placeholder="All lists" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PILE_OVERVIEW}>All lists</SelectItem>
              <SelectItem value={ALL_PILE_UNLISTED}>Unlisted</SelectItem>
              {namedLists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={ALL_PILE_NEW_LIST} data-all-pile-new-list="">
                New list
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {filter !== 'completed' && (
        <form onSubmit={handleQuickAdd} className="mb-6">
          <div className="flex gap-2">
            <Input
              id="create-task-title"
              ref={inputRef}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={`Add task${filter === 'today' ? ' for today' : ''}...`}
              disabled={createMutation.isPending}
              className="flex-1"
            />
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
            <Button type="submit" disabled={createMutation.isPending || !newTaskTitle.trim()}>
              {createMutation.isPending ? '...' : 'Add'}
            </Button>
          </div>
        </form>
      )}

      {activeError ? (
        <ErrorState error={activeError} onRetry={() => refetchActive()} />
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
            {filter === 'completed' ? (
              <CheckCheck className="mx-auto mb-2 h-8 w-8" />
            ) : (
              <CheckSquare className="mx-auto mb-2 h-8 w-8" />
            )}
            <p>{emptyTitle}</p>
            <p className="text-sm">{emptyHint}</p>
          </CardContent>
        </Card>
      ) : filter === 'today' ? (
        <TodayTaskList
          tasks={tasks}
          exitDirections={exitDirections}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onDelete={(id) => setDeleteConfirmId(id)}
          onEdit={handleEdit}
          isLoading={isLoading}
          assigneeLabel={assigneeLabelFor}
          listLabel={listLabelFor}
        />
      ) : allPile?.kind === 'overview' ? (
        <div className="space-y-6">
          {overviewGroups.map((group) => (
            <div
              key={group.key}
              data-pile-group={group.kind}
              data-pile-name={group.name}
            >
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <List className="h-4 w-4" />
                <span className="text-sm font-medium">{group.name}</span>
              </div>
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
                      onPin={handlePin}
                      onUnpin={handleUnpin}
                      onDelete={(id) => setDeleteConfirmId(id)}
                      onEdit={handleEdit}
                      isLoading={isLoading}
                      assigneeLabel={assigneeLabelFor(task)}
                      listLabel={listLabelFor(task)}
                    />
                  </AnimatedListItem>
                ))}
              </AnimatedList>
            </div>
          ))}
        </div>
      ) : (
        <AnimatedList>
          {tasks.map((task, index) => (
            <AnimatedListItem
              key={task.id}
              id={task.id}
              exitDirection={exitDirections[task.id] ?? 'right'}
            >
              <TaskCard
                task={task}
                onComplete={handleComplete}
                onUncomplete={handleUncomplete}
                onPin={handlePin}
                onUnpin={handleUnpin}
                onDelete={(id) => setDeleteConfirmId(id)}
                onEdit={handleEdit}
                isLoading={isLoading}
                assigneeLabel={assigneeLabelFor(task)}
                listLabel={listLabelFor(task)}
                reorder={reorderFor(index)}
              />
            </AnimatedListItem>
          ))}
        </AnimatedList>
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

      <CreateNamedListDialog
        open={createListOpen}
        onOpenChange={setCreateListOpen}
        onCreated={(list) => {
          navigate({
            to: '/tasks',
            search: { filter: 'all', pile: list.id },
          });
        }}
      />

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
        isLoading={updateMutation.isPending}
        isFetchingCapture={isFetchingCapture}
        members={members.map((m) => ({ userId: m.userId, label: memberLabel(m) }))}
        lists={namedLists.map((list) => ({ id: list.id, name: list.name }))}
      />
    </div>
  );
}
