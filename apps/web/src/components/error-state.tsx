import { Link } from '@tanstack/react-router';
import { Button, buttonVariants } from '@yoink/ui-base/components/button';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { isFetchError } from '@ts-rest/react-query/v5';
import { WifiOff, AlertCircle, RefreshCw, Settings } from 'lucide-react';

type ErrorStateProps = {
  error: { status: number; body?: unknown } | Error;
  onRetry: () => void;
};

const getErrorMessage = (body: unknown): string | undefined => {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const errorBody = body as { error?: string };
    return errorBody.error;
  }
  return undefined;
};

/**
 * Context-aware error state component.
 * Shows appropriate message and recovery actions based on error type:
 * - Network errors: "Unable to connect" + retry button
 * - 401 Unauthorized: "Session expired" + go to settings
 * - Other API errors: Generic error + retry button
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  // Network/fetch error (timeout, DNS, CORS, etc.)
  if (isFetchError(error)) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <WifiOff className="mx-auto mb-3 h-8 w-8 text-yellow-600" />
          <p className="text-muted-foreground mb-1">Unable to connect to the server</p>
          <p className="text-sm text-muted-foreground mb-4">
            Please check your internet connection.
          </p>
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // API error with status code
  const apiError = error as { status: number; body?: unknown };

  // 401 Unauthorized - token is invalid or expired
  if (apiError.status === 401) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <p className="text-muted-foreground mb-1">Your session has expired</p>
          <p className="text-sm text-muted-foreground mb-4">
            Please reconfigure your API token.
          </p>
          <Link to="/settings" className={buttonVariants({ variant: 'outline' })}>
            <Settings className="h-4 w-4" />
            Go to Settings
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Other API errors (500, etc.)
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <p className="text-muted-foreground mb-1">Something went wrong</p>
        <p className="text-sm text-muted-foreground mb-4">
          {getErrorMessage(apiError.body) || `Error ${apiError.status}`}
        </p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}
