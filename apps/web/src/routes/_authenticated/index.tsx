import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { captureApi } from '@/api/client';
import { useNetworkStatus } from '@/lib/use-network-status';
import type { Capture } from '@yoink/api-contracts';
import { Archive, Inbox, Settings } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/')({
  component: InboxPage,
});

function InboxPage() {
  const isOnline = useNetworkStatus();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const loadCaptures = async () => {
    try {
      const response = await captureApi.list({ query: { status: 'inbox' } });
      if (response.status === 200) {
        setCaptures(response.body.captures);
      }
    } catch {
      toast.error('Failed to load captures');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCaptures();
  }, []);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setIsCreating(true);
    try {
      const response = await captureApi.create({
        body: { content: newContent.trim() },
      });

      if (response.status === 201) {
        setCaptures((prev) => [response.body, ...prev]);
        setNewContent('');
        toast.success('Capture added');
      } else {
        toast.error('Failed to add capture');
      }
    } catch {
      toast.error('Failed to add capture');
    } finally {
      setIsCreating(false);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const response = await captureApi.update({
        params: { id },
        body: { status: 'archived' },
      });

      if (response.status === 200) {
        setCaptures((prev) => prev.filter((c) => c.id !== id));
        toast.success('Archived');
      } else {
        toast.error('Failed to archive');
      }
    } catch {
      toast.error('Failed to archive');
    }
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
            disabled={isCreating || !isOnline}
            className="flex-1"
          />
          <Button type="submit" disabled={isCreating || !newContent.trim() || !isOnline}>
            {isCreating ? '...' : 'Add'}
          </Button>
        </div>
      </form>

      {isLoading ? (
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
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDate(capture.capturedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleArchive(capture.id)}
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
