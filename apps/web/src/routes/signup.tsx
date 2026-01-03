import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { z } from 'zod';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import { Key, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { validateInvitation, signupWithPasskey } from '@/api/auth';
import { suggestDeviceName } from '@/api/passkey';

const signupSearchSchema = z.object({
  code: z.string().optional(),
});

export const Route = createFileRoute('/signup')({
  component: SignupPage,
  validateSearch: signupSearchSchema,
});

type InvitationInfo = {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string | null;
  role: 'admin' | 'member';
  expiresAt: string;
};

type Step = 'code' | 'details' | 'complete';

function SignupPage() {
  const { code: urlCode } = useSearch({ from: '/signup' });
  const [step, setStep] = useState<Step>('code');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);

  // Check for invitation code in URL
  useEffect(() => {
    if (urlCode) {
      setCode(urlCode);
      // Auto-validate if code is provided
      handleValidateCode(urlCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode]);

  // Set suggested device name when reaching details step (only once)
  useEffect(() => {
    if (step === 'details') {
      setDeviceName(suggestDeviceName());
    }
    // Only run when step changes, not when deviceName changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleValidateCode = async (codeToValidate?: string) => {
    const inviteCode = codeToValidate || code;
    if (!inviteCode.trim()) return;

    setIsLoading(true);
    setError(null);

    const result = await validateInvitation(inviteCode.trim());

    setIsLoading(false);

    if (result.ok) {
      setInvitation(result.data);
      // If invitation has a restricted email, pre-fill it
      if (result.data.email) {
        setEmail(result.data.email);
      }
      setStep('details');
    } else {
      setError(result.error);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation || !email.trim()) return;

    setIsLoading(true);
    setError(null);

    const result = await signupWithPasskey({
      code: code.trim(),
      email: email.trim(),
      deviceName: deviceName.trim() || undefined,
    });

    setIsLoading(false);

    if (result.ok) {
      setStep('complete');
      // Redirect to home after a brief delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } else {
      setError(result.error);
    }
  };

  if (step === 'complete') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Welcome to Yoink!</CardTitle>
            <CardDescription>
              Your account has been created. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (step === 'details' && invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>
              You're joining <strong>{invitation.organizationName}</strong> as a{' '}
              {invitation.role}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={isLoading || !!invitation.email}
                  required
                />
                {invitation.email && (
                  <p className="text-xs text-muted-foreground">
                    This invitation is restricted to this email address.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="device-name">Device Name</Label>
                <Input
                  id="device-name"
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g., MacBook Pro"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  A friendly name for your passkey (optional).
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" disabled={isLoading || !email.trim()} className="w-full" size="lg">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    Create account with Passkey
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep('code');
                  setInvitation(null);
                  setError(null);
                }}
                disabled={isLoading}
              >
                Use a different invitation code
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step: code
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join Yoink</CardTitle>
          <CardDescription>
            Enter your invitation code to create an account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Invitation Code</Label>
            <Input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
              disabled={isLoading}
              className="text-center text-lg tracking-widest"
              maxLength={8}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            onClick={() => handleValidateCode()}
            disabled={isLoading || !code.trim()}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              'Continue'
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
