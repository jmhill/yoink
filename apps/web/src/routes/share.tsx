import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { captureApi } from '@/api/client';
import { tokenStorage } from '@/lib/token';
import { combineShareParams, parseShareParams } from '@/lib/share';
import { toast } from 'sonner';
import { X } from 'lucide-react';

export const Route = createFileRoute('/share')({
  component: SharePage,
});

function SharePage() {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Parse share params from URL on mount
  useEffect(() => {
    const params = parseShareParams(new URLSearchParams(window.location.search));
    const combined = combineShareParams(params);
    setContent(combined);
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
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      const response = await captureApi.create({
        body: { content: content.trim() },
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
              disabled={!content.trim() || isSaving || isClosing}
            >
              {isSaving ? 'Saving...' : isClosing ? 'Saved!' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
