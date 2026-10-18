import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@yoink/ui-base/components/sheet';
import { Crown, Shield, User, Trash2, Loader2, AlertCircle, Users, Bot, Plus, Copy, Check, KeyRound } from 'lucide-react';
import { cn } from '@yoink/ui-base/lib/utils';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import { toast } from 'sonner';
import { listMembers, removeMember, mintAgent, memberDisplayName, memberLabel, type Member } from '@/api/auth';
import { tsrOrganizations } from '@/api/client';
import {
  CHANGE_ROLE_STORAGE_MESSAGE,
  ErrorSchema,
  HAND_OVER_OWNERSHIP_FIRST_MESSAGE,
  HANDOVER_OWNERSHIP_PATH,
  MAKE_ADMIN_LABEL,
  MAKE_MEMBER_LABEL,
  THE_OWNER_CANT_BE_REMOVED_MESSAGE,
  demoteConfirmMessage,
  madeAdminToast,
  madeMemberToast,
} from '@yoink/api-contracts';
import { OwnershipCard } from '@/components/ownership-card';
import { useDesktopLayout } from '@/lib/use-desktop-layout';
import {
  canChangeRole,
  canReissue,
  canRemove,
  roleActionFor,
} from '@/lib/member-row-actions';
import { roleActionMenuCoords } from '@/lib/role-action-menu';

const errorBodyMessage = (body: unknown): string | null => {
  const parsed = ErrorSchema.safeParse(body);
  return parsed.success ? parsed.data.message : null;
};

type MembersSectionProps = {
  organizationId: string;
  organizationName: string;
  currentUserId: string;
  currentUserRole: 'owner' | 'admin' | 'member';
  isPersonal: boolean;
  onMembershipChanged?: () => void;
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

const rowLabel = (member: Member): string =>
  member.kind === 'agent' ? memberLabel(member) : memberDisplayName(member);

export function MembersSection({
  organizationId,
  organizationName,
  currentUserId,
  currentUserRole,
  isPersonal,
  onMembershipChanged,
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
  const [reissueError, setReissueError] = useState<string | null>(null);
  const [rawReissuedToken, setRawReissuedToken] = useState<string | null>(null);
  const [demotingMember, setDemotingMember] = useState<Member | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const viewer = { userId: currentUserId, role: currentUserRole };

  const reissueMutation = tsrOrganizations.reissueAgentToken.useMutation({
    onSuccess: (result) => {
      if (result.status === 201) {
        setRawReissuedToken(result.body.rawToken);
        return;
      }
      setReissueError(errorBodyMessage(result.body) ?? 'Failed to issue token');
    },
    onError: () => {
      setReissueError('Failed to issue token');
    },
  });

  const changeRoleMutation = tsrOrganizations.changeMemberRole.useMutation({
    onSuccess: (result, variables) => {
      if (result.status === 200) {
        const name = memberDisplayName(result.body.member);
        if (variables.body.role === 'admin') {
          toast.success(madeAdminToast(name));
        } else {
          toast.success(madeMemberToast(name));
        }
        setDemotingMember(null);
        setRoleError(null);
        loadMembers('refresh');
        return;
      }
      setRoleError(errorBodyMessage(result.body) ?? CHANGE_ROLE_STORAGE_MESSAGE);
    },
    onError: () => {
      setRoleError(CHANGE_ROLE_STORAGE_MESSAGE);
    },
  });

  const canMint = currentUserRole === 'owner' || currentUserRole === 'admin';

  const loadMembers = async (mode: 'replace' | 'refresh' = 'replace') => {
    if (mode === 'replace') {
      setState({ status: 'loading' });
    }
    const result = await listMembers(organizationId);
    if (result.ok) {
      setState({ status: 'success', members: result.data.members });
    } else if (mode === 'replace') {
      setState({ status: 'error', error: result.error });
    }
  };

  useEffect(() => {
    loadMembers();
  }, [organizationId]);

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
      loadMembers('refresh');
    } else {
      setRemoveError(result.error);
    }
  };

  const requestRole = (target: Member, role: 'admin' | 'member') => {
    setRoleError(null);
    changeRoleMutation.mutate({
      params: { organizationId, userId: target.userId },
      body: { role },
    });
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
              {roleError && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{roleError}</span>
                </div>
              )}
              {state.members.map((member) => {
                const isSelf = member.userId === currentUserId;
                const showRemove = canRemove(viewer, member);
                const showRole = canChangeRole(viewer, member);
                const showReissue = canReissue(viewer, member);
                const label = rowLabel(member);

                return (
                  <div
                    key={member.userId}
                    data-member-row={label}
                    data-member-role={member.role}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted">
                        {getRoleIcon(member.role)}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {label}
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
                      {member.role === 'owner' ? (
                        <p
                          className="max-w-[14rem] text-right text-sm text-muted-foreground"
                          data-owner-cannot-remove=""
                        >
                          {currentUserId === member.userId ? (
                            <a
                              href={HANDOVER_OWNERSHIP_PATH}
                              data-handover-link=""
                              className="underline underline-offset-2"
                            >
                              {HAND_OVER_OWNERSHIP_FIRST_MESSAGE}
                            </a>
                          ) : (
                            THE_OWNER_CANT_BE_REMOVED_MESSAGE
                          )}
                        </p>
                      ) : null}
                      {showRole ? (
                        <MemberRoleAction
                          member={member}
                          pending={changeRoleMutation.isPending}
                          onPromote={() => requestRole(member, 'admin')}
                          onDemote={() => setDemotingMember(member)}
                        />
                      ) : null}
                      {showReissue && (
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
                          title={`Remove ${label}`}
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
        <DialogContent data-reissue-dialog="">
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
              <div className="p-3 rounded-lg border bg-muted font-mono text-sm break-all" data-reissued-token="">
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
                  disabled={reissueMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!reissuingMember) return;
                    setReissueError(null);
                    reissueMutation.mutate({
                      params: { organizationId, userId: reissuingMember.userId },
                      body: {},
                    });
                  }}
                  disabled={reissueMutation.isPending}
                >
                  {reissueMutation.isPending ? (
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

      {state.status === 'success' ? (
        <OwnershipCard
          organizationId={organizationId}
          isPersonal={isPersonal}
          currentUserId={currentUserId}
          members={state.members}
          onTransferred={() => {
            loadMembers();
            onMembershipChanged?.();
          }}
        />
      ) : null}

      <Dialog open={!!demotingMember} onOpenChange={(open) => {
        if (!open) {
          setDemotingMember(null);
        }
      }}>
        <DialogContent data-demote-confirm="">
          <DialogHeader>
            <DialogTitle>{MAKE_MEMBER_LABEL}</DialogTitle>
            <DialogDescription>
              {demotingMember ? demoteConfirmMessage(memberDisplayName(demotingMember)) : ''}
            </DialogDescription>
          </DialogHeader>
          {roleError && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{roleError}</span>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDemotingMember(null)}
              disabled={changeRoleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              data-confirm-demote=""
              onClick={() => {
                if (!demotingMember) return;
                requestRole(demotingMember, 'member');
              }}
              disabled={changeRoleMutation.isPending}
            >
              {changeRoleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                MAKE_MEMBER_LABEL
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removingMember} onOpenChange={() => setRemovingMember(null)}>
        <DialogContent data-remove-confirm="">
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove {removingMember ? rowLabel(removingMember) : ''} from {organizationName}? They will lose access to all
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

type MemberRoleActionProps = {
  member: Member;
  pending: boolean;
  onPromote: () => void;
  onDemote: () => void;
};

function MemberRoleAction({ member, pending, onPromote, onDemote }: MemberRoleActionProps) {
  const isDesktop = useDesktopLayout();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const action = roleActionFor(member);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
      setMenuCoords(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(false);
        setMenuCoords(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menuOpen]);

  if (action === null) {
    return null;
  }
  const label = action === 'admin' ? MAKE_ADMIN_LABEL : MAKE_MEMBER_LABEL;
  const choose = () => {
    if (action === 'admin') {
      onPromote();
    } else {
      onDemote();
    }
    setSheetOpen(false);
    setMenuOpen(false);
    setMenuCoords(null);
  };

  const openDesktopMenu = () => {
    const triggerBox = triggerRef.current?.getBoundingClientRect();
    if (!triggerBox) {
      return;
    }
    setMenuCoords(
      roleActionMenuCoords({
        trigger: triggerBox,
        viewport: {
          top: 0,
          left: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
          width: window.innerWidth,
          height: window.innerHeight,
        },
      })
    );
    setMenuOpen(true);
  };

  if (isDesktop) {
    return (
      <>
        <div ref={triggerRef} className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-role-action={action}
            onClick={() => {
              if (menuOpen) {
                setMenuOpen(false);
                setMenuCoords(null);
                return;
              }
              openDesktopMenu();
            }}
          >
            {label}
          </Button>
        </div>
        {menuOpen && menuCoords
          ? createPortal(
              <div
                ref={menuRef}
                role="menu"
                data-role-menu=""
                className="bg-popover text-popover-foreground min-w-[8rem] rounded-md border p-1 shadow-md"
                style={{
                  position: 'fixed',
                  top: menuCoords.top,
                  left: menuCoords.left,
                  zIndex: 100,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  data-role-action-item=""
                  className={cn(
                    'relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm',
                    'outline-hidden select-none hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={choose}
                  disabled={pending}
                >
                  {label}
                </button>
              </div>,
              document.body
            )
          : null}
      </>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={label}
        data-role-action={action}
        onClick={() => setSheetOpen(true)}
      >
        {label}
      </Button>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent data-role-sheet="" side="bottom" className="gap-0">
          <SheetHeader>
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription>{memberDisplayName(member)}</SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <Button
              className="w-full"
              data-role-action-item=""
              onClick={choose}
              disabled={pending}
            >
              {label}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
