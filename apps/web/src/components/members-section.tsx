import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { Button } from '@yoink/ui-base/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import { Crown, Shield, User, Trash2, Loader2, AlertCircle, Users, Bot, Plus, Copy, Check, KeyRound } from 'lucide-react';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import { listMembers, removeMember, mintAgent, reissueAgentToken, memberLabel, type Member } from '@/api/auth';

type MembersSectionProps = {
  organizationId: string;
  organizationName: string;
  currentUserId: string;
  currentUserRole: 'owner' | 'admin' | 'member';
};

type MembersState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; members: Member[] };

const getRoleIcon = (role: 'owner' | 'admin' | 'member') => {
  switch (role) {
    case 'owner':
      return <Crown className="h-4 w-4 text-amber-500" />;
    case 'admin':
      return <Shield className="h-4 w-4 text-blue-500" />;
    case 'member':
      return <User className="h-4 w-4 text-muted-foreground" />;
  }
};

const getRoleLabel = (role: 'owner' | 'admin' | 'member') => {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'member':
      return 'Member';
  }
};

/**
 * Check if the current user can remove the target member.
 * - Owners can remove anyone (except themselves)
 * - Admins can only remove members (not other admins or owners)
 * - Members cannot remove anyone
 */
const canRemove = (
  currentRole: 'owner' | 'admin' | 'member',
  targetRole: 'owner' | 'admin' | 'member',
  isSelf: boolean
): boolean => {
  if (isSelf) return false;
  if (currentRole === 'member') return false;
  if (currentRole === 'admin' && (targetRole === 'admin' || targetRole === 'owner')) return false;
  return true;
};

export function MembersSection({
  organizationId,
  organizationName,
  currentUserId,
  currentUserRole,
}: MembersSectionProps) {
  const [state, setState] = useState<MembersState>({ status: 'loading' });
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [mintOpen, setMintOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [rawAgentToken, setRawAgentToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reissuingMember, setReissuingMember] = useState<Member | null>(null);
  const [isReissuing, setIsReissuing] = useState(false);
  const [reissueError, setReissueError] = useState<string | null>(null);
  const [rawReissuedToken, setRawReissuedToken] = useState<string | null>(null);

  const canMint = currentUserRole === 'owner' || currentUserRole === 'admin';
  const canReissue = currentUserRole === 'owner';

  const loadMembers = async () => {
    setState({ status: 'loading' });
    const result = await listMembers(organizationId);
    if (result.ok) {
      setState({ status: 'success', members: result.data.members });
    } else {
      setState({ status: 'error', error: result.error });
    }
  };

  useEffect(() => {
    loadMembers();
  }, [organizationId]);

  // Reset error when dialog opens
  useEffect(() => {
    if (removingMember) {
      setRemoveError(null);
    }
  }, [removingMember]);

  const handleRemove = async () => {
    if (!removingMember) return;

    setIsRemoving(true);
    setRemoveError(null);

    const result = await removeMember(organizationId, removingMember.userId);

    setIsRemoving(false);

    if (result.ok) {
      setRemovingMember(null);
      loadMembers();
    } else {
      setRemoveError(result.error);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members
          </CardTitle>
          <CardDescription>People with access to {organizationName}</CardDescription>
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
            <div className="space-y-2">
              {state.members.map((member) => {
                const isSelf = member.userId === currentUserId;
                const showRemove = canRemove(currentUserRole, member.role, isSelf);

                return (
                  <div
                    key={member.userId}
                    data-member-row={memberLabel(member)}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted">
                        {getRoleIcon(member.role)}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {memberLabel(member)}
                          {isSelf && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                              You
                            </span>
                          )}
                          {member.kind === 'agent' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                              Agent
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {member.kind === 'agent' ? 'Agent' : getRoleLabel(member.role)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {canReissue && member.kind === 'agent' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReissuingMember(member);
                            setReissueError(null);
                            setRawReissuedToken(null);
                            setCopied(false);
                          }}
                        >
                          <KeyRound className="h-4 w-4 mr-1" />
                          Issue new token
                        </Button>
                      )}
                      {showRemove && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRemovingMember(member)}
                          title={`Remove ${member.email}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {state.members.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No members found
                </div>
              )}

              {canMint && (
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => {
                    setMintOpen(true);
                    setAgentName('');
                    setMintError(null);
                    setRawAgentToken(null);
                    setCopied(false);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add agent
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={mintOpen} onOpenChange={(open) => {
        setMintOpen(open);
        if (!open && rawAgentToken) {
          loadMembers();
        }
      }}>
        <DialogContent>
          {rawAgentToken ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500" />
                  Agent token
                </DialogTitle>
                <DialogDescription>
                  Copy this token now. You won&apos;t be able to see it again.
                </DialogDescription>
              </DialogHeader>
              <div className="p-3 rounded-lg border bg-muted font-mono text-sm break-all">
                {rawAgentToken}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(rawAgentToken);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button onClick={() => {
                  setMintOpen(false);
                  loadMembers();
                }}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Add agent
                </DialogTitle>
                <DialogDescription>
                  Create a token-only member for the task board. It cannot sign in with a passkey or create captures.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Vault bot"
                  disabled={isMinting}
                />
              </div>
              {mintError && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{mintError}</span>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setMintOpen(false)} disabled={isMinting}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!agentName.trim()) {
                      setMintError('Name is required');
                      return;
                    }
                    setIsMinting(true);
                    setMintError(null);
                    const result = await mintAgent(organizationId, agentName.trim());
                    setIsMinting(false);
                    if (result.ok) {
                      setRawAgentToken(result.data.rawToken);
                    } else {
                      setMintError(result.error);
                    }
                  }}
                  disabled={isMinting || !agentName.trim()}
                >
                  {isMinting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create agent'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reissuingMember} onOpenChange={(open) => {
        if (!open) {
          setReissuingMember(null);
          setRawReissuedToken(null);
          setReissueError(null);
        }
      }}>
        <DialogContent>
          {rawReissuedToken ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500" />
                  New agent token
                </DialogTitle>
                <DialogDescription>
                  Copy this token now. You won&apos;t be able to see it again.
                  The previous token for {reissuingMember ? memberLabel(reissuingMember) : 'this agent'} no longer works.
                </DialogDescription>
              </DialogHeader>
              <div className="p-3 rounded-lg border bg-muted font-mono text-sm break-all">
                {rawReissuedToken}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(rawReissuedToken);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button onClick={() => {
                  setReissuingMember(null);
                  setRawReissuedToken(null);
                }}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Issue new token</DialogTitle>
                <DialogDescription>
                  The current token for {reissuingMember ? memberLabel(reissuingMember) : 'this agent'} will
                  stop working immediately. Anyone still using it will be locked out.
                  The member&apos;s name, tasks, and history stay the same.
                </DialogDescription>
              </DialogHeader>
              {reissueError && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{reissueError}</span>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setReissuingMember(null)}
                  disabled={isReissuing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!reissuingMember) return;
                    setIsReissuing(true);
                    setReissueError(null);
                    const result = await reissueAgentToken(organizationId, reissuingMember.userId);
                    setIsReissuing(false);
                    if (result.ok) {
                      setRawReissuedToken(result.data.rawToken);
                    } else {
                      setReissueError(result.error);
                    }
                  }}
                  disabled={isReissuing}
                >
                  {isReissuing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Issuing...
                    </>
                  ) : (
                    'Issue new token'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove member confirmation dialog */}
      <Dialog open={!!removingMember} onOpenChange={() => setRemovingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove {removingMember?.email} from {organizationName}? They will lose access to all
              organization data.
            </DialogDescription>
          </DialogHeader>

          {removeError && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{removeError}</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovingMember(null)} disabled={isRemoving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
              {isRemoving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
