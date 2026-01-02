import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import {
  Mail,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  Link as LinkIcon,
  Shield,
  User,
} from 'lucide-react';
import {
  createInvitation,
  listPendingInvitations,
  revokeInvitation,
  type Invitation,
} from '@/api/auth';

type InvitationsSectionProps = {
  organizationId: string;
  organizationName: string;
};

type InvitationsState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; invitations: Invitation[] };

type CreateState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'success'; invitation: Invitation }
  | { status: 'error'; error: string };

const formatExpiry = (expiresAt: string): string => {
  const expires = new Date(expiresAt);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Expired';
  if (diffDays === 1) return 'Expires in 1 day';
  return `Expires in ${diffDays} days`;
};

export function InvitationsSection({ organizationId, organizationName }: InvitationsSectionProps) {
  const [state, setState] = useState<InvitationsState>({ status: 'loading' });
  const [createState, setCreateState] = useState<CreateState>({ status: 'idle' });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member');
  const [newEmail, setNewEmail] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const loadInvitations = async () => {
    setState({ status: 'loading' });
    const result = await listPendingInvitations(organizationId);
    if (result.ok) {
      setState({ status: 'success', invitations: result.data.invitations });
    } else {
      setState({ status: 'error', error: result.error });
    }
  };

  useEffect(() => {
    loadInvitations();
  }, [organizationId]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (showCreateDialog) {
      setCreateState({ status: 'idle' });
      setNewRole('member');
      setNewEmail('');
      setCopiedCode(false);
      setCopiedLink(false);
    }
  }, [showCreateDialog]);

  const handleCreate = async () => {
    setCreateState({ status: 'creating' });

    const result = await createInvitation(organizationId, {
      role: newRole,
      email: newEmail.trim() || undefined,
    });

    if (result.ok) {
      setCreateState({ status: 'success', invitation: result.data });
      loadInvitations();
    } else {
      setCreateState({ status: 'error', error: result.error });
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setRevokingId(invitationId);
    setRevokeError(null);

    const result = await revokeInvitation(invitationId);

    setRevokingId(null);

    if (result.ok) {
      loadInvitations();
    } else {
      setRevokeError(result.error);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = async (code: string) => {
    const link = `${window.location.origin}/signup?code=${code}`;
    await navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Invitations
              </CardTitle>
              <CardDescription>Invite people to join {organizationName}</CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Invite
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {state.status === 'loading' && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          {state.status === 'success' && (
            <>
              {revokeError && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10 mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{revokeError}</span>
                </div>
              )}

              <div className="space-y-2">
                {state.invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-full bg-muted shrink-0">
                        {invitation.role === 'admin' ? (
                          <Shield className="h-4 w-4 text-blue-500" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-sm truncate">
                          {invitation.code}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span className="capitalize">{invitation.role}</span>
                          {invitation.email && (
                            <>
                              <span>|</span>
                              <span className="truncate">{invitation.email}</span>
                            </>
                          )}
                          <span>|</span>
                          <span>{formatExpiry(invitation.expiresAt)}</span>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRevoke(invitation.id)}
                      disabled={revokingId === invitation.id}
                      title="Revoke invitation"
                    >
                      {revokingId === invitation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      )}
                    </Button>
                  </div>
                ))}

                {state.invitations.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No pending invitations
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create invitation dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create invitation</DialogTitle>
            <DialogDescription>
              Create an invitation link to add someone to {organizationName}
            </DialogDescription>
          </DialogHeader>

          {createState.status === 'success' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 text-sm p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Invitation created successfully!</span>
              </div>

              <div className="space-y-2">
                <Label>Invitation Code</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-sm">
                    {createState.invitation.code}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyCode(createState.invitation.code)}
                  >
                    {copiedCode ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Shareable Link</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-xs truncate">
                    {window.location.origin}/signup?code={createState.invitation.code}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyLink(createState.invitation.code)}
                  >
                    {copiedLink ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <LinkIcon className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={() => setShowCreateDialog(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex gap-2">
                  <Button
                    variant={newRole === 'member' ? 'default' : 'outline'}
                    onClick={() => setNewRole('member')}
                    className="flex-1"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Member
                  </Button>
                  <Button
                    variant={newRole === 'admin' ? 'default' : 'outline'}
                    onClick={() => setNewRole('admin')}
                    className="flex-1"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Admin
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email restriction <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="anyone@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  If provided, only this email address can use the invitation.
                </p>
              </div>

              {createState.status === 'error' && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{createState.error}</span>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  disabled={createState.status === 'creating'}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createState.status === 'creating'}
                >
                  {createState.status === 'creating' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create invitation'
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
