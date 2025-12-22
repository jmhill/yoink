import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { Tabs, TabsList, TabsTrigger } from '@yoink/ui-base/components/tabs';
import { tsr } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
import { Archive, Inbox, Settings, RotateCcw, Link as LinkIcon, Clock } from 'lucide-react';
import { ErrorState } from '@/components/error-state';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/archived')({
  component: ArchivedPage,
});

function ArchivedPage() {
  const tsrQueryClient = tsr.useQueryClient();

  const { data, isPending, error, refetch } = tsr.list.useQuery({
    queryKey: ['captures', 'archived'],
    queryData: { query: { status: 'archived' as const } },
  });

  const unarchiveMutation = tsr.unarchive.useMutation({
    onMutate: async ({ params }) => {
      // Cancel in-flight queries to prevent overwrites
      await tsrQueryClient.cancelQueries({ queryKey: ['captures'] });

      // Snapshot current state for rollback
      const previousArchived = tsrQueryClient.list.getQueryData([
        'captures',
        'archived',
      ]);
      const previousInbox = tsrQueryClient.list.getQueryData([
        'captures',
        'inbox',
      ]);

      // Find the capture being unarchived
      if (previousArchived?.status === 200) {
        const captureToUnarchive = previousArchived.body.captures.find(
          (c) => c.id === params.id
        );

        // Remove from archived
        tsrQueryClient.list.setQueryData(['captures', 'archived'], {
          ...previousArchived,
          body: {
            ...previousArchived.body,
            captures: previousArchived.body.captures.filter(
              (c) => c.id !== params.id
            ),
          },
        });

        // Add to inbox (if cache exists)
        if (captureToUnarchive && previousInbox?.status === 200) {
          tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
            ...previousInbox,
            body: {
              ...previousInbox.body,
              captures: [
                { ...captureToUnarchive, status: 'inbox' as const },
                ...previousInbox.body.captures,
              ],
            },
          });
        }
      }

      return { previousArchived, previousInbox };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousArchived) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'archived'],
          context.previousArchived
        );
      }
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          context.previousInbox
        );
      }

      // Show error toast
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to unarchive');
      }
    },

    onSuccess: () => {
      toast.success('Moved to inbox');
    },

    onSettled: () => {
      // Refetch to ensure consistency with server
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });

  const handleUnarchive = (id: string) => {
    unarchiveMutation.mutate({
      params: { id },
      body: {},
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const captures = data?.status === 200 ? data.body.captures : [];

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Yoink</h1>
        <Button variant="ghost" size="icon" asChild title="Settings">
          <Link to="/settings">
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="archived" className="mb-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="snoozed" asChild>
            <Link to="/snoozed" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Snoozed
            </Link>
          </TabsTrigger>
          <TabsTrigger value="inbox" asChild>
            <Link to="/" className="flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Inbox
            </Link>
          </TabsTrigger>
          <TabsTrigger value="archived" asChild>
            <Link to="/archived" className="flex items-center gap-2">
              <Archive className="h-4 w-4" />
              Archived
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Archive className="mx-auto mb-2 h-8 w-8" />
            <p>No archived captures</p>
            <p className="text-sm">Archived items will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {captures.map((capture) => (
            <Card key={capture.id} data-capture-id={capture.id}>
              <CardContent className="flex items-start justify-between gap-2 py-3">
                <div className="flex-1 min-w-0">
                  <p className="whitespace-pre-wrap break-words">{capture.content}</p>
                  {capture.sourceUrl && (
                    <a
                      href={capture.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 hover:underline"
                      data-testid="source-url"
                    >
                      <LinkIcon className="h-3 w-3" />
                      <span className="truncate">{capture.sourceUrl}</span>
                    </a>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(capture.capturedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleUnarchive(capture.id)}
                  disabled={unarchiveMutation.isPending}
                  title="Move to inbox"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
