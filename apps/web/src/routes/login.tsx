import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { Key, Loader2, AlertCircle } from 'lucide-react';
import { loginWithPasskey } from '@/api/auth';

const loginSearchSchema = z.object({
  returnTo: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  component: LoginPage,
  validateSearch: loginSearchSchema,
});

function LoginPage() {
  const { returnTo } = useSearch({ from: '/login' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    const result = await loginWithPasskey();

    setIsLoading(false);

    if (result.ok) {
      // Navigate to return URL or home
      // Using window.location for return URLs since they're dynamic paths
      window.location.href = returnTo || '/';
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to Yoink with your passkey</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button onClick={handleLogin} disabled={isLoading} className="w-full" size="lg">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <Key className="h-4 w-4 mr-2" />
                Sign in with Passkey
              </>
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/signup" className="text-primary hover:underline">
              Sign up with an invitation
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
