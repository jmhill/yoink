import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tsr } from '@/api/client';
import { useNetworkStatus } from '@/lib/use-network-status';
import { isFetchError } from '@ts-rest/react-query/v5';
import { Archive, Inbox, Settings, Link as LinkIcon, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/')({
  component: InboxPage,
});

function InboxPage() {
  const isOnline = useNetworkStatus();
  const [newContent, setNewContent] = useState('');
  const tsrQueryClient = tsr.useQueryClient();

  const { data, isPending, error } = tsr.list.useQuery({
    queryKey: ['captures', 'inbox'],
    queryData: { query: { status: 'inbox' as const } },
  });

  const createMutation = tsr.create.useMutation({
    onSuccess: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
      setNewContent('');
      toast.success('Capture added');
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to add capture');
      }
    },
  });

  const archiveMutation = tsr.update.useMutation({
    onSuccess: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
      toast.success('Archived');
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to archive');
      }
    },
  });

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
      body: { status: 'archived' },
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

  // Error state
  if (error) {
    if (isFetchError(error)) {
      return (
        <div className="container mx-auto max-w-2xl p-4">
          <Card>
            <CardContent className="py-8 text-center">
              <WifiOff className="mx-auto mb-2 h-8 w-8 text-yellow-600" />
              <p className="text-gray-600">Unable to connect to the server.</p>
              <p className="text-sm text-gray-500">Please check your internet connection.</p>
            </CardContent>
          </Card>
        </div>
      );
    }
    // Contract-defined error (401, etc)
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

      <Tabs defaultValue="inbox" className="mb-6">
        <TabsList className="grid w-full grid-cols-2">
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

      {isPending ? (
        <p className="text-center text-gray-500">Loading...</p>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <Inbox className="mx-auto mb-2 h-8 w-8" />
            <p>Your inbox is empty</p>
            <p className="text-sm">Add a quick capture above to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {captures.map((capture) => (
            <Card key={capture.id}>
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
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDate(capture.capturedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleArchive(capture.id)}
                  disabled={archiveMutation.isPending}
                  title="Archive"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
