import { Link, createFileRoute } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { tsrLists } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
import { ArrowLeft, ChevronDown, ChevronUp, List } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';

export const Route = createFileRoute('/_authenticated/lists_/unlisted')({
  component: UnlistedPilePage,
});

function UnlistedPilePage() {
  const queryClient = tsrLists.useQueryClient();

  const { data, isPending, error, refetch } = tsrLists.listUnlistedOpenTasks.useQuery({
    queryKey: ['unlisted', 'tasks'],
    queryData: {},
  });

  const reorderMutation = tsrLists.reorderUnlistedOpenTasks.useMutation({
    onSuccess: (result) => {
      if (result.status === 200) {
        queryClient.setQueryData(['unlisted', 'tasks'], result);
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
      queryClient.invalidateQueries({ queryKey: ['unlisted', 'tasks'] });
    },
  });

  const tasks = data?.status === 200 ? data.body.tasks : [];

  const moveTask = (taskId: string, direction: 'up' | 'down') => {
    const index = tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= tasks.length) return;
    const next = [...tasks];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    reorderMutation.mutate({
      body: { taskIds: next.map((task) => task.id) },
    });
  };

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header viewName="Unlisted" />

      <div className="mb-4">
        <Button type="button" variant="ghost" asChild>
          <Link to="/lists">
            <ArrowLeft className="h-4 w-4" />
            All lists
          </Link>
        </Button>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <List className="mx-auto mb-2 h-8 w-8" />
            <p>No open unlisted tasks</p>
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-3">
          {tasks.map((task, index) => (
            <li key={task.id}>
              <Card data-open-task-id={task.id} data-open-task-title={task.title}>
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <p className="font-medium">{task.title}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${task.title} up`}
                      disabled={index === 0 || reorderMutation.isPending}
                      onClick={() => moveTask(task.id, 'up')}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${task.title} down`}
                      disabled={index === tasks.length - 1 || reorderMutation.isPending}
                      onClick={() => moveTask(task.id, 'down')}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
