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
import { tsrTasks, tsr } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
import { CheckSquare, Calendar, CalendarClock, List, CheckCheck, AlertCircle } from 'lucide-react';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';
import { TaskCard } from '@/components/task-card';
import { TaskEditModal } from '@/components/task-edit-modal';
import { AnimatedList, AnimatedListItem, type ExitDirection } from '@/components/animated-list';
import { toast } from 'sonner';
import type { TaskFilter, Task, Capture } from '@yoink/api-contracts';

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
  filter: z.enum(['today', 'upcoming', 'all', 'completed']).default('today'),
});

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
                />
              </AnimatedListItem>
            ))}
          </AnimatedList>
        </div>
      )}
    </div>
  );
}

function TasksPage() {
  const { filter } = useSearch({ from: '/_authenticated/tasks' });
  const navigate = useNavigate();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [exitDirections, setExitDirections] = useState<Record<string, ExitDirection>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [sourceCapture, setSourceCapture] = useState<Capture | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tsrQueryClient = tsrTasks.useQueryClient();
  const captureQueryClient = tsr.useQueryClient();

  const { data, isPending, error, refetch } = tsrTasks.list.useQuery({
    queryKey: ['tasks', filter],
    queryData: { query: { filter: filter as TaskFilter } },
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
      tsrQueryClient.invalidateQueries({ queryKey: ['tasks'] });
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
      tsrQueryClient.invalidateQueries({ queryKey: ['tasks'] });
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
      tsrQueryClient.invalidateQueries({ queryKey: ['tasks'] });
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
      tsrQueryClient.invalidateQueries({ queryKey: ['tasks'] });
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
      tsrQueryClient.invalidateQueries({ queryKey: ['tasks'] });
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
      tsrQueryClient.invalidateQueries({ queryKey: ['tasks'] });
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
      setSourceCapture(null);
    },

    onSettled: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // Fetch source capture when editing a task with captureId
  const [isFetchingCapture, setIsFetchingCapture] = useState(false);
  
  useEffect(() => {
    if (editingTask?.captureId) {
      setIsFetchingCapture(true);
      // Use the cached data if available
      const cachedData = captureQueryClient.get.getQueryData(['capture', editingTask.captureId]);
      if (cachedData?.status === 200) {
        setSourceCapture(cachedData.body);
        setIsFetchingCapture(false);
      } else {
        // Fetch via the API
        fetch(`/api/captures/${editingTask.captureId}`, { credentials: 'include' })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            setSourceCapture(data);
            setIsFetchingCapture(false);
          })
          .catch(() => {
            setSourceCapture(null);
            setIsFetchingCapture(false);
          });
      }
    } else {
      setSourceCapture(null);
      setIsFetchingCapture(false);
    }
  }, [editingTask?.captureId, captureQueryClient]);

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    // Get today's date for "today" filter tasks
    const dueDate = filter === 'today' ? new Date().toISOString().split('T')[0] : undefined;

    createMutation.mutate({
      body: { title: newTaskTitle.trim(), dueDate },
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
      search: { filter: newFilter as 'today' | 'upcoming' | 'all' | 'completed' },
    });
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
  };

  const handleSaveEdit = (taskId: string, updates: { title?: string; dueDate?: string | null }) => {
    updateMutation.mutate({
      params: { id: taskId },
      body: updates,
    });
  };

  const tasks = data?.status === 200 ? data.body.tasks : [];
  const isLoading =
    createMutation.isPending ||
    completeMutation.isPending ||
    uncompleteMutation.isPending ||
    pinMutation.isPending ||
    unpinMutation.isPending ||
    deleteMutation.isPending;

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header viewName="Tasks" />

      <Tabs value={filter} onValueChange={handleFilterChange} className="mb-6">
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
          <TabsTrigger value="all" className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
            <List className="h-4 w-4 shrink-0" />
            <span className="truncate">All</span>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
            <CheckCheck className="h-4 w-4 shrink-0" />
            <span className="truncate">Done</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {filter !== 'completed' && (
        <form onSubmit={handleQuickAdd} className="mb-6">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={`Add task${filter === 'today' ? ' for today' : ''}...`}
              disabled={createMutation.isPending}
              className="flex-1"
            />
            <Button type="submit" disabled={createMutation.isPending || !newTaskTitle.trim()}>
              {createMutation.isPending ? '...' : 'Add'}
            </Button>
          </div>
        </form>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {filter === 'completed' ? (
              <CheckCheck className="mx-auto mb-2 h-8 w-8" />
            ) : (
              <CheckSquare className="mx-auto mb-2 h-8 w-8" />
            )}
            <p>
              {filter === 'today' && 'No tasks for today'}
              {filter === 'upcoming' && 'No upcoming tasks'}
              {filter === 'all' && 'No tasks yet'}
              {filter === 'completed' && 'No completed tasks'}
            </p>
            <p className="text-sm">
              {filter === 'today' && 'Add a task above or process a capture'}
              {filter === 'upcoming' && 'Tasks with future due dates will appear here'}
              {filter === 'all' && 'Create your first task above'}
              {filter === 'completed' && 'Complete a task to see it here'}
            </p>
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
        />
      ) : (
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
                onPin={handlePin}
                onUnpin={handleUnpin}
                onDelete={(id) => setDeleteConfirmId(id)}
                onEdit={handleEdit}
                isLoading={isLoading}
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

      {/* Task edit modal */}
      <TaskEditModal
        open={editingTask !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTask(null);
            setSourceCapture(null);
          }
        }}
        task={editingTask}
        sourceCapture={sourceCapture}
        onSave={handleSaveEdit}
        isLoading={updateMutation.isPending}
        isFetchingCapture={isFetchingCapture}
      />
    </div>
  );
}
