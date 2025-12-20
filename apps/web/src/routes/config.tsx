import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { tokenStorage } from '@/lib/token';
import { captureApi } from '@/api/client';

export const Route = createFileRoute('/config')({
  component: ConfigPage,
});

function ConfigPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if redirected from share page
  const isFromShare = new URLSearchParams(window.location.search).get('from') === 'share';

  useEffect(() => {
    const existingToken = tokenStorage.get();
    if (existingToken) {
      setToken(existingToken);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Save the token first so the API client uses it
    tokenStorage.set(token);

    try {
      // Validate the token by making a test request
      const response = await captureApi.list({ query: { limit: 1 } });

      if (response.status === 200) {
        navigate({ to: '/' });
      } else if (response.status === 401) {
        tokenStorage.remove();
        setError('Invalid API token');
      } else {
        tokenStorage.remove();
        setError('Failed to validate token');
      }
    } catch {
      tokenStorage.remove();
      setError('Failed to connect to the API');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Yoink</CardTitle>
          <CardDescription className="text-center">
            {isFromShare
              ? 'Please configure your API token to capture shared content.'
              : 'Enter your API token to start capturing notes.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">API Token</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your API token"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Validating...' : 'Save Token'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
