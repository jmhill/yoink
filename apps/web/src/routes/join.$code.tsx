import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { Loader2, AlertCircle, CheckCircle2, Building2, Users } from 'lucide-react';
import { getSession, validateInvitation, acceptInvitation, switchOrganization } from '@/api/auth';

export const Route = createFileRoute('/join/$code')({
  component: JoinPage,
});

type InvitationInfo = {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string | null;
  role: 'admin' | 'member';
  expiresAt: string;
};

type PageState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'validating' }
  | { status: 'confirmation'; invitation: InvitationInfo }
  | { status: 'accepting' }
  | { status: 'success'; organizationName: string }
  | { status: 'error'; message: string };

function JoinPage() {
  const { code } = useParams({ from: '/join/$code' });
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    const checkAuthAndValidate = async () => {
      // First check if user is authenticated
      const sessionResult = await getSession();

      if (!sessionResult.ok) {
        // Not authenticated - redirect to signup with the code
        navigate({ to: '/signup', search: { code } });
        return;
      }

      // User is authenticated - validate the invitation
      setState({ status: 'validating' });

      const validateResult = await validateInvitation(code);

      if (!validateResult.ok) {
        setState({ status: 'error', message: validateResult.error });
        return;
      }

      // Show confirmation UI
      setState({ status: 'confirmation', invitation: validateResult.data });
    };

    checkAuthAndValidate().catch(() => {
      setState({ status: 'error', message: 'An unexpected error occurred' });
    });
  }, [code, navigate]);

  const handleAccept = async () => {
    if (state.status !== 'confirmation') return;

    setState({ status: 'accepting' });

    const result = await acceptInvitation(code);

    if (!result.ok) {
      setState({ status: 'error', message: result.error });
      return;
    }

    // Switch to the new organization
    const switchResult = await switchOrganization(result.data.organizationId);

    if (!switchResult.ok) {
      // Even if switch fails, user is now a member - just go home
      console.warn('Failed to switch organization:', switchResult.error);
    }

    setState({ status: 'success', organizationName: result.data.organizationName });

    // Redirect to home after a brief delay
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  };

  const handleCancel = () => {
    navigate({ to: '/' });
  };

  // Loading state
  if (state.status === 'loading' || state.status === 'validating' || state.status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (state.status === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Welcome!</CardTitle>
            <CardDescription>
              You've joined <strong>{state.organizationName}</strong>. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Error state
  if (state.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Unable to Join</CardTitle>
            <CardDescription data-testid="invitation-error">
              {state.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={handleCancel}>
              Go to Inbox
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Accepting state
  if (state.status === 'accepting') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Joining organization...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Confirmation state
  const { invitation } = state;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Join Organization</CardTitle>
          <CardDescription>
            You've been invited to join an organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Organization</p>
                <p className="font-medium" data-testid="invitation-org-name">
                  {invitation.organizationName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Your Role</p>
                <p className="font-medium capitalize" data-testid="invitation-role">
                  {invitation.role}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={handleAccept} className="w-full" size="lg">
              Join {invitation.organizationName}
            </Button>
            <Button variant="ghost" onClick={handleCancel} className="w-full">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
