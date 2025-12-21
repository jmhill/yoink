import { useState, useEffect } from 'react';
import { storage } from '@/lib/storage';
import { createCaptureApi } from '@/lib/api-client';
import { getPageInfo, getActiveTabInfo } from '@/lib/messages';

type Status = 'loading' | 'not-configured' | 'ready' | 'capturing' | 'success' | 'error';

export function Popup() {
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  // Initialize popup
  useEffect(() => {
    const initialize = async () => {
      // Check if configured
      const isConfigured = await storage.isConfigured();
      if (!isConfigured) {
        setStatus('not-configured');
        return;
      }

      // Try to get page info from content script
      const pageInfo = await getPageInfo();
      if (pageInfo) {
        // Use selection if available, otherwise use page title
        setContent(pageInfo.selection || pageInfo.title);
        setSourceUrl(pageInfo.url);
      } else {
        // Fallback to tab API (works on pages where content script can't run)
        const tabInfo = await getActiveTabInfo();
        if (tabInfo) {
          setContent(tabInfo.title);
          setSourceUrl(tabInfo.url);
        }
      }

      setStatus('ready');
    };

    initialize();
  }, []);

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError('Please enter some content to capture');
      return;
    }

    setStatus('capturing');

    try {
      const api = await createCaptureApi();
      if (!api) {
        setStatus('not-configured');
        return;
      }

      const response = await api.create({
        body: {
          content: content.trim(),
          sourceUrl: sourceUrl || undefined,
          sourceApp: 'browser-extension',
        },
      });

      if (response.status === 201) {
        setStatus('success');
        // Close popup after short delay
        setTimeout(() => window.close(), 800);
      } else if (response.status === 401) {
        setError('Invalid API token. Please check your settings.');
        setStatus('error');
      } else {
        setError(`Failed to capture: ${response.status}`);
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture');
      setStatus('error');
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  // Not configured state
  if (status === 'not-configured') {
    return (
      <div className="w-80 p-4 bg-background text-foreground">
        <h1 className="text-lg font-semibold mb-2">Yoink</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Please configure your API settings to start capturing.
        </p>
        <button
          onClick={openOptions}
          className="w-full px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Open Settings
        </button>
      </div>
    );
  }

  // Loading state
  if (status === 'loading') {
    return (
      <div className="w-80 p-4 bg-background text-foreground">
        <h1 className="text-lg font-semibold mb-2">Yoink</h1>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="w-80 p-4 bg-background text-foreground">
        <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span className="font-medium">Captured!</span>
        </div>
      </div>
    );
  }

  // Main capture form
  return (
    <div className="w-80 p-4 bg-background text-foreground">
      <h1 className="text-lg font-semibold mb-3">Yoink</h1>

      <form onSubmit={handleCapture} className="space-y-3">
        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What do you want to capture?"
            rows={4}
            className="w-full px-3 py-2 border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            disabled={status === 'capturing'}
            autoFocus
          />
        </div>

        {sourceUrl && (
          <div className="text-xs text-muted-foreground truncate" title={sourceUrl}>
            From: {sourceUrl}
          </div>
        )}

        {error && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={status === 'capturing'}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'capturing' ? 'Capturing...' : 'Capture'}
          </button>
          <button
            type="button"
            onClick={openOptions}
            className="px-3 py-2 text-muted-foreground hover:text-foreground"
            title="Settings"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
