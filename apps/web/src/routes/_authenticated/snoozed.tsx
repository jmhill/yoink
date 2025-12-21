import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { Tabs, TabsList, TabsTrigger } from '@yoink/ui-base/components/tabs';
import { tsr } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
import { Archive, Inbox, Settings, AlarmClockOff, Link as LinkIcon, WifiOff, Clock } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/snoozed')({
  component: SnoozedPage,
});

function SnoozedPage() {
  const tsrQueryClient = tsr.useQueryClient();

  const { data, isPending, error } = tsr.list.useQuery({
    queryKey: ['captures', 'snoozed'],
    queryData: { query: { status: 'inbox' as const, snoozed: true } },
  });

  const unsnoozeMutation = tsr.unsnooze.useMutation({
    onMutate: async ({ params }) => {
      // Cancel in-flight queries to prevent overwrites
      await tsrQueryClient.cancelQueries({ queryKey: ['captures'] });

      // Snapshot current state for rollback
      const previousSnoozed = tsrQueryClient.list.getQueryData([
        'captures',
        'snoozed',
      ]);
      const previousInbox = tsrQueryClient.list.getQueryData([
        'captures',
        'inbox',
      ]);

      // Find the capture being unsnoozed
      if (previousSnoozed?.status === 200) {
        const captureToUnsnooze = previousSnoozed.body.captures.find(
          (c) => c.id === params.id
        );

        // Remove from snoozed
        tsrQueryClient.list.setQueryData(['captures', 'snoozed'], {
          ...previousSnoozed,
          body: {
            ...previousSnoozed.body,
            captures: previousSnoozed.body.captures.filter(
              (c) => c.id !== params.id
            ),
          },
        });

        // Add to inbox (if cache exists)
        if (captureToUnsnooze && previousInbox?.status === 200) {
          tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
            ...previousInbox,
            body: {
              ...previousInbox.body,
              captures: [
                { ...captureToUnsnooze, snoozedUntil: undefined },
                ...previousInbox.body.captures,
              ],
            },
          });
        }
      }

      return { previousSnoozed, previousInbox };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousSnoozed) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'snoozed'],
          context.previousSnoozed
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
        toast.error('Failed to unsnooze');
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

  const handleUnsnooze = (id: string) => {
    unsnoozeMutation.mutate({
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

  const formatWakeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Waking soon';
    if (diffMins < 60) return `Waking in ${diffMins}m`;
    if (diffHours < 24) return `Waking in ${diffHours}h`;
    if (diffDays < 7) return `Waking in ${diffDays}d`;
    return `Waking ${date.toLocaleDateString()}`;
  };

  // Error state
  if (error) {
    if (isFetchError(error)) {
      return (
        <div className="container mx-auto max-w-2xl p-4">
          <Card>
            <CardContent className="py-8 text-center">
              <WifiOff className="mx-auto mb-2 h-8 w-8 text-yellow-600" />
              <p className="text-muted-foreground">Unable to connect to the server.</p>
              <p className="text-sm text-muted-foreground">Please check your internet connection.</p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="container mx-auto max-w-2xl p-4">
        <Card>
          <CardContent className="py-8 text-center text-red-600">
            <p>Failed to load captures</p>
            <p className="text-sm">Status: {error.status}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

      <Tabs defaultValue="snoozed" className="mb-6">
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

      {isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Clock className="mx-auto mb-2 h-8 w-8" />
            <p>No snoozed captures</p>
            <p className="text-sm">Snoozed items will appear here until they wake up</p>
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
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(capture.capturedAt)}</span>
                    {capture.snoozedUntil && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock className="h-3 w-3" />
                        {formatWakeTime(capture.snoozedUntil)}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleUnsnooze(capture.id)}
                  disabled={unsnoozeMutation.isPending}
                  title="Wake up now"
                  aria-label="Unsnooze"
                >
                  <AlarmClockOff className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
