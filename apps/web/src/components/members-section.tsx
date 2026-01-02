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
import { Crown, Shield, User, Trash2, Loader2, AlertCircle, Users } from 'lucide-react';
import { listMembers, removeMember, type Member } from '@/api/auth';

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
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted">
                        {getRoleIcon(member.role)}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {member.email}
                          {isSelf && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {getRoleLabel(member.role)}
                        </div>
                      </div>
                    </div>

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
                );
              })}

              {state.members.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No members found
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
