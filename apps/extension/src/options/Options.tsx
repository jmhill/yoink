import { useState, useEffect } from 'react';
import { storage } from '@/lib/storage';
import { createCaptureApiWithConfig } from '@/lib/api-client';

type Status = 'idle' | 'loading' | 'validating' | 'success' | 'error';

export function Options() {
  const [apiUrl, setApiUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  // Load existing config on mount
  useEffect(() => {
    const loadConfig = async () => {
      setStatus('loading');
      try {
        const config = await storage.get();
        setApiUrl(config.apiUrl ?? '');
        setToken(config.token ?? '');
        setStatus('idle');
      } catch {
        setStatus('error');
        setError('Failed to load configuration');
      }
    };
    loadConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!apiUrl.trim()) {
      setError('API URL is required');
      return;
    }
    if (!token.trim()) {
      setError('API Token is required');
      return;
    }

    // Validate URL format
    try {
      new URL(apiUrl);
    } catch {
      setError('Invalid API URL format');
      return;
    }

    // Validate token by making a test API call
    setStatus('validating');
    try {
      const api = createCaptureApiWithConfig({
        apiUrl: apiUrl.trim(),
        token: token.trim(),
      });

      const response = await api.list({ query: { limit: 1 } });

      if (response.status === 401) {
        setError('Invalid API token');
        setStatus('error');
        return;
      }

      if (response.status !== 200) {
        setError(`API error: ${response.status}`);
        setStatus('error');
        return;
      }

      // Save config
      await storage.set({
        apiUrl: apiUrl.trim(),
        token: token.trim(),
      });

      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to connect to API'
      );
      setStatus('error');
    }
  };

  const handleClear = async () => {
    await storage.remove();
    setApiUrl('');
    setToken('');
    setStatus('idle');
    setError(null);
  };

  if (status === 'loading') {
    return (
      <div className="max-w-md mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">Yoink Options</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Yoink Options</h1>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="apiUrl"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            API URL
          </label>
          <input
            id="apiUrl"
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://your-yoink-api.fly.dev"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            disabled={status === 'validating'}
          />
          <p className="mt-1 text-xs text-gray-500">
            The base URL of your Yoink API server
          </p>
        </div>

        <div>
          <label
            htmlFor="token"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            API Token
          </label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="tokenId:secret"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            disabled={status === 'validating'}
          />
          <p className="mt-1 text-xs text-gray-500">
            Your API token in the format tokenId:secret
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">
              Configuration saved successfully!
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={status === 'validating'}
            className="flex-1 px-4 py-2 bg-orange-500 text-white font-medium rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'validating' ? 'Validating...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={status === 'validating'}
            className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}
