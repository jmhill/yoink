import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useRef } from 'react';
import { Button, buttonVariants } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { Tabs, TabsList, TabsTrigger } from '@yoink/ui-base/components/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@yoink/ui-base/components/dropdown-menu';
import { tsr } from '@/api/client';
import { useNetworkStatus } from '@/lib/use-network-status';
import { isFetchError } from '@ts-rest/react-query/v5';
import { Archive, Inbox, Link as LinkIcon, Pin, Clock } from 'lucide-react';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/')({
  component: InboxPage,
});

function InboxPage() {
  const isOnline = useNetworkStatus();
  const [newContent, setNewContent] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tsrQueryClient = tsr.useQueryClient();

  const { data, isPending, error, refetch } = tsr.list.useQuery({
    queryKey: ['captures', 'inbox'],
    queryData: { query: { status: 'inbox' as const, snoozed: false } },
  });

  const createMutation = tsr.create.useMutation({
    onMutate: async ({ body }) => {
      // Cancel in-flight queries to prevent overwrites
      await tsrQueryClient.cancelQueries({ queryKey: ['captures'] });

      // Snapshot current state for rollback
      const previousInbox = tsrQueryClient.list.getQueryData([
        'captures',
        'inbox',
      ]);

      // Create optimistic capture with temp ID
      const optimisticCapture = {
        id: `temp-${Date.now()}`,
        organizationId: 'temp',
        createdById: 'temp',
        content: body.content,
        title: body.title,
        sourceUrl: body.sourceUrl,
        sourceApp: body.sourceApp ?? 'web',
        status: 'inbox' as const,
        capturedAt: new Date().toISOString(),
      };

      if (previousInbox?.status === 200) {
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
          ...previousInbox,
          body: {
            ...previousInbox.body,
            captures: [optimisticCapture, ...previousInbox.body.captures],
          },
        });
      }

      // Clear input immediately for snappy UX
      setNewContent('');

      return { previousInbox, previousContent: body.content };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          context.previousInbox
        );
      }
      // Restore the input content so user doesn't lose their text
      if (context?.previousContent) {
        setNewContent(context.previousContent);
      }

      // Show error toast
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to add capture');
      }
    },

    onSuccess: () => {
      toast.success('Capture added');
    },

    onSettled: () => {
      // Refetch to ensure consistency with server (replaces temp ID with real one)
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
      // Keep focus on input for rapid multi-capture
      inputRef.current?.focus();
    },
  });

  const archiveMutation = tsr.archive.useMutation({
    onMutate: async ({ params }) => {
      // Cancel in-flight queries to prevent overwrites
      await tsrQueryClient.cancelQueries({ queryKey: ['captures'] });

      // Snapshot current state for rollback
      const previousInbox = tsrQueryClient.list.getQueryData([
        'captures',
        'inbox',
      ]);
      const previousArchived = tsrQueryClient.list.getQueryData([
        'captures',
        'archived',
      ]);

      // Find the capture being archived
      if (previousInbox?.status === 200) {
        const captureToArchive = previousInbox.body.captures.find(
          (c) => c.id === params.id
        );

        // Remove from inbox
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
          ...previousInbox,
          body: {
            ...previousInbox.body,
            captures: previousInbox.body.captures.filter(
              (c) => c.id !== params.id
            ),
          },
        });

        // Add to archived (if cache exists)
        if (captureToArchive && previousArchived?.status === 200) {
          tsrQueryClient.list.setQueryData(['captures', 'archived'], {
            ...previousArchived,
            body: {
              ...previousArchived.body,
              captures: [
                { ...captureToArchive, status: 'archived' as const },
                ...previousArchived.body.captures,
              ],
            },
          });
        }
      }

      return { previousInbox, previousArchived };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          context.previousInbox
        );
      }
      if (context?.previousArchived) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'archived'],
          context.previousArchived
        );
      }

      // Show error toast
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to archive');
      }
    },

    onSuccess: () => {
      toast.success('Archived');
    },

    onSettled: () => {
      // Refetch to ensure consistency with server
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });

  // Pin mutation helper - uses different endpoints for pin/unpin
  const pinMutationInternal = tsr.pin.useMutation({
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to pin');
      }
    },
    onSuccess: () => {
      toast.success('Pinned');
    },
    onSettled: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });

  const unpinMutationInternal = tsr.unpin.useMutation({
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to unpin');
      }
    },
    onSuccess: () => {
      toast.success('Unpinned');
    },
    onSettled: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });

  // Snooze mutation
  const snoozeMutation = tsr.snooze.useMutation({
    onMutate: async ({ params }) => {
      // Cancel in-flight queries to prevent overwrites
      await tsrQueryClient.cancelQueries({ queryKey: ['captures'] });

      // Snapshot current state for rollback
      const previousInbox = tsrQueryClient.list.getQueryData([
        'captures',
        'inbox',
      ]);
      const previousSnoozed = tsrQueryClient.list.getQueryData([
        'captures',
        'snoozed',
      ]);

      // Find the capture being snoozed
      if (previousInbox?.status === 200) {
        const captureToSnooze = previousInbox.body.captures.find(
          (c) => c.id === params.id
        );

        // Remove from inbox
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
          ...previousInbox,
          body: {
            ...previousInbox.body,
            captures: previousInbox.body.captures.filter(
              (c) => c.id !== params.id
            ),
          },
        });

        // Add to snoozed (if cache exists)
        if (captureToSnooze && previousSnoozed?.status === 200) {
          tsrQueryClient.list.setQueryData(['captures', 'snoozed'], {
            ...previousSnoozed,
            body: {
              ...previousSnoozed.body,
              captures: [captureToSnooze, ...previousSnoozed.body.captures],
            },
          });
        }
      }

      return { previousInbox, previousSnoozed };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          context.previousInbox
        );
      }
      if (context?.previousSnoozed) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'snoozed'],
          context.previousSnoozed
        );
      }

      // Show error toast
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to snooze');
      }
    },

    onSuccess: () => {
      toast.success('Snoozed');
    },

    onSettled: () => {
      // Refetch to ensure consistency with server
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });

  // Wrapper to handle optimistic updates for both pin/unpin
  const handlePinOptimistic = async (id: string, isPinning: boolean) => {
    // Cancel in-flight queries to prevent overwrites
    await tsrQueryClient.cancelQueries({ queryKey: ['captures'] });

    // Snapshot current state for rollback
    const previousInbox = tsrQueryClient.list.getQueryData([
      'captures',
      'inbox',
    ]);

    // Optimistically update the pin state
    if (previousInbox?.status === 200) {
      const updatedCaptures = previousInbox.body.captures.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            pinnedAt: isPinning ? new Date().toISOString() : undefined,
          };
        }
        return c;
      });

      // Re-sort: pinned first (by pinnedAt DESC), then unpinned (by capturedAt DESC)
      updatedCaptures.sort((a, b) => {
        const aPinned = a.pinnedAt ? 1 : 0;
        const bPinned = b.pinnedAt ? 1 : 0;
        if (aPinned !== bPinned) {
          return bPinned - aPinned;
        }
        if (a.pinnedAt && b.pinnedAt) {
          return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
        }
        return new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
      });

      tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
        ...previousInbox,
        body: {
          ...previousInbox.body,
          captures: updatedCaptures,
        },
      });
    }

    // Call the actual mutation
    try {
      if (isPinning) {
        await pinMutationInternal.mutateAsync({ params: { id }, body: {} });
      } else {
        await unpinMutationInternal.mutateAsync({ params: { id }, body: {} });
      }
    } catch {
      // Rollback on error
      if (previousInbox) {
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], previousInbox);
      }
    }
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    createMutation.mutate({
      body: { content: newContent.trim(), sourceApp: 'web' },
    });
  };

  const handleArchive = (id: string) => {
    archiveMutation.mutate({
      params: { id },
      body: {},
    });
  };

  const handlePin = (id: string, isPinned: boolean) => {
    handlePinOptimistic(id, !isPinned);
  };

  // Snooze time helpers
  const getSnoozeTime = (option: 'later-today' | 'tomorrow' | 'next-week'): string => {
    const now = new Date();

    switch (option) {
      case 'later-today': {
        // 6 PM today, or 2 hours from now if past 4 PM
        const sixPm = new Date(now);
        sixPm.setHours(18, 0, 0, 0);
        if (now.getHours() >= 16) {
          // If past 4 PM, snooze for 2 hours
          return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
        }
        return sixPm.toISOString();
      }
      case 'tomorrow': {
        // 9 AM tomorrow
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.toISOString();
      }
      case 'next-week': {
        // 9 AM next Monday
        const nextMonday = new Date(now);
        const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
        nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
        nextMonday.setHours(9, 0, 0, 0);
        return nextMonday.toISOString();
      }
    }
  };

  const handleSnooze = (id: string, option: 'later-today' | 'tomorrow' | 'next-week') => {
    const until = getSnoozeTime(option);
    snoozeMutation.mutate({
      params: { id },
      body: { until },
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
      <Header />

      <Tabs defaultValue="inbox" className="mb-6">
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

      <form onSubmit={handleQuickAdd} className="mb-6">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={isOnline ? 'Quick capture...' : 'Offline - cannot add captures'}
            disabled={createMutation.isPending || !isOnline}
            className="flex-1"
          />
          <Button type="submit" disabled={createMutation.isPending || !newContent.trim() || !isOnline}>
            {createMutation.isPending ? '...' : 'Add'}
          </Button>
        </div>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-8 w-8" />
            <p>Your inbox is empty</p>
            <p className="text-sm">Add a quick capture above to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {captures.map((capture) => {
            const isPinned = Boolean(capture.pinnedAt);
            return (
              <Card
                key={capture.id}
                data-capture-id={capture.id}
                className={isPinned ? 'border-l-4 border-l-primary' : ''}
              >
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
                  <div className="flex gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={snoozeMutation.isPending}
                        aria-label="Snooze"
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                      >
                        <Clock className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleSnooze(capture.id, 'later-today')}>
                          Later today
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleSnooze(capture.id, 'tomorrow')}>
                          Tomorrow
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleSnooze(capture.id, 'next-week')}>
                          Next week
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handlePin(capture.id, isPinned)}
                      disabled={pinMutationInternal.isPending || unpinMutationInternal.isPending}
                      aria-label={isPinned ? 'Unpin' : 'Pin'}
                    >
                      <Pin className={`h-4 w-4 ${isPinned ? 'fill-current' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleArchive(capture.id)}
                      disabled={archiveMutation.isPending}
                      title="Archive"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
