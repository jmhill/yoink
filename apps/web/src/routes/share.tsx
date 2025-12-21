import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { tsr } from '@/api/client';
import { tokenStorage } from '@/lib/token';
import { useNetworkStatus } from '@/lib/use-network-status';
import { extractContent, extractUrl, parseShareParams } from '@/lib/share';
import { toast } from 'sonner';
import { WifiOff, X, Link as LinkIcon } from 'lucide-react';

export const Route = createFileRoute('/share')({
  component: SharePage,
});

function SharePage() {
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Parse share params from URL on mount
  useEffect(() => {
    const params = parseShareParams(new URLSearchParams(window.location.search));
    setContent(extractContent(params));
    setSourceUrl(extractUrl(params));
  }, []);

  // Check if token is configured
  useEffect(() => {
    if (!tokenStorage.isConfigured()) {
      // Redirect to config with a message using window.location
      // to avoid TanStack Router type issues with search params
      window.location.href = '/config?from=share';
    }
  }, []);

  const handleClose = () => {
    // Try to close the window (works when opened as share target)
    // Falls back to navigating to inbox if we can't close
    if (window.opener || window.history.length <= 1) {
      window.close();
    } else {
      navigate({ to: '/' });
    }
  };

  const handleCancel = () => {
    handleClose();
  };

  const handleSave = async () => {
    // Need either content or URL to save
    if (!content.trim() && !sourceUrl) return;

    setIsSaving(true);
    try {
      // Use direct mutation (fire-and-forget, no Query caching needed)
      const response = await tsr.create.mutate({
        body: {
          content: content.trim() || sourceUrl || '',
          sourceUrl,
          sourceApp: 'share',
        },
      });

      if (response.status === 201) {
        toast.success('Captured!');
        setIsClosing(true);
        // Brief delay to show the success toast, then close
        setTimeout(() => {
          handleClose();
        }, 1000);
      } else {
        toast.error('Failed to save capture');
        setIsSaving(false);
      }
    } catch {
      toast.error('Failed to save capture');
      setIsSaving(false);
    }
  };

  // Don't render if not configured (will redirect)
  if (!tokenStorage.isConfigured()) {
    return null;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Quick Capture</CardTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCancel}
              disabled={isSaving || isClosing}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!isOnline && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-yellow-100 px-3 py-2 text-sm text-yellow-800">
              <WifiOff className="h-4 w-4" />
              <span>You're offline. Cannot save captures.</span>
            </div>
          )}
          {sourceUrl && (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-muted-foreground">{sourceUrl}</span>
            </div>
          )}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="placeholder:text-muted-foreground dark:bg-input/30 border-input w-full min-h-32 resize-none rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
            placeholder="What do you want to capture?"
            autoFocus
            disabled={isSaving || isClosing}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving || isClosing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={(!content.trim() && !sourceUrl) || isSaving || isClosing || !isOnline}
            >
              {isSaving ? 'Saving...' : isClosing ? 'Saved!' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
