import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { captureApi } from '@/api/client';
import { tokenStorage } from '@/lib/token';
import type { Capture } from '@yoink/api-contracts';
import { Archive, Inbox, Settings, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/archived')({
  component: ArchivedPage,
});

function ArchivedPage() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCaptures = async () => {
    try {
      const response = await captureApi.list({ query: { status: 'archived' } });
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

  const handleUnarchive = async (id: string) => {
    try {
      const response = await captureApi.update({
        params: { id },
        body: { status: 'inbox' },
      });

      if (response.status === 200) {
        setCaptures((prev) => prev.filter((c) => c.id !== id));
        toast.success('Moved to inbox');
      } else {
        toast.error('Failed to unarchive');
      }
    } catch {
      toast.error('Failed to unarchive');
    }
  };

  const handleClearToken = () => {
    tokenStorage.remove();
    window.location.href = '/config';
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
        <Button variant="ghost" size="icon" onClick={handleClearToken} title="Settings">
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      <Tabs defaultValue="archived" className="mb-6">
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

      {isLoading ? (
        <p className="text-center text-gray-500">Loading...</p>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <Archive className="mx-auto mb-2 h-8 w-8" />
            <p>No archived captures</p>
            <p className="text-sm">Archived items will appear here</p>
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
                  onClick={() => handleUnarchive(capture.id)}
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
