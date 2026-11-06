import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@yoink/ui-base/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@yoink/ui-base/components/dialog';
import {
  BOT_CANNOT_BE_ADMIN_MESSAGE,
  CANCEL_LABEL,
  COPY_LINK_LABEL,
  CREATE_OWNER_INVITE_LABEL,
  CREATE_OWNER_INVITE_STORAGE_MESSAGE,
  LINK_COPIED_TOAST,
  MAKE_NEW_LINK_LABEL,
  NEW_LINK_LABEL,
  OWNER_EMAIL_LABEL,
  USE_DIFFERENT_EMAIL_LABEL,
  memberDisplayName,
  newLinkConfirm,
  ownerAssignedToast,
  ownerInviteCreatedMessage,
  ownerInviteExpired,
  ownerInvitePending,
  ownerLabel,
  type AdminWorkspaceListItem,
  type Organization,
} from '@yoink/api-contracts';
import {
  adminClient,
  httpFailureBody,
  httpStatusOf,
  isNetworkFailure,
  type AdminClient,
} from '@/api/client';
import { parseCreateUserKind, parseCreateUserRole } from '@/lib/parse-create-user-fields';
import { WifiOff, Mail, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/organizations/$orgId')({
  component: OrganizationDetailPage,
});

function OrganizationDetailPage() {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [isInviteResultDialogOpen, setIsInviteResultDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({});
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [createUserEmail, setCreateUserEmail] = useState('');
  const [createUserName, setCreateUserName] = useState('');
  const [createUserKind, setCreateUserKind] = useState<'human' | 'agent'>('human');
  const [createUserRole, setCreateUserRole] = useState<'member' | 'admin'>('member');
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [ownerSectionError, setOwnerSectionError] = useState<string | null>(null);
  const [isNewLinkConfirmOpen, setIsNewLinkConfirmOpen] = useState(false);
  const [isDifferentEmailOpen, setIsDifferentEmailOpen] = useState(false);
  const [isCreateOwnerInviteOpen, setIsCreateOwnerInviteOpen] = useState(false);
  const [isOwnerInviteResultOpen, setIsOwnerInviteResultOpen] = useState(false);
  const [differentOwnerEmail, setDifferentOwnerEmail] = useState('');
  const [createOwnerInviteEmail, setCreateOwnerInviteEmail] = useState('');
  const [expiredFormOrgId, setExpiredFormOrgId] = useState(orgId);
  const [expiredFormEmail, setExpiredFormEmail] = useState<string | null>(null);
  const [ownerInviteUrl, setOwnerInviteUrl] = useState<string | null>(null);
  const [ownerInviteEmail, setOwnerInviteEmail] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const invalidateMembers = () => {
    queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'users'] });
  };

  const invalidateOwnerInvitation = () => {
    queryClient.invalidateQueries({
      queryKey: ['organizations', orgId, 'owner-invitation'],
    });
  };

  const invalidateOrganizations = () => {
    queryClient.invalidateQueries({ queryKey: ['organizations'] });
  };

  const joinUrlForCode = (code: string): string => {
    const baseUrl = window.location.origin.replace('admin.', '');
    return `${baseUrl}/join/${code}`;
  };

  const formatInviteDate = (dateString: string): string =>
    new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const errorMessage = (body: unknown, fallback: string): string => {
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
    return fallback;
  };

  const mutationErrorMessage = (err: unknown, fallback: string): string => {
    if (isNetworkFailure(err)) {
      return 'Network error. Please check your connection.';
    }
    return errorMessage(httpFailureBody(err), fallback);
  };

  const { data: orgData, isPending: orgPending, error: orgError } = useQuery({
    queryKey: ['organizations', orgId],
    queryFn: () => adminClient.getOrganization({ id: orgId }),
  });

  const { data: usersData, isPending: usersPending } = useQuery({
    queryKey: ['organizations', orgId, 'users'],
    queryFn: () => adminClient.listUsers({ organizationId: orgId }),
  });

  const { data: ownerInvitationData } = useQuery({
    queryKey: ['organizations', orgId, 'owner-invitation'],
    queryFn: () => adminClient.getOwnerInvitation({ id: orgId }),
  });

  if (expiredFormOrgId !== orgId) {
    setExpiredFormOrgId(orgId);
    setExpiredFormEmail(null);
  }

  useEffect(() => {
    if (orgPending || usersPending) {
      return;
    }
    if (window.location.hash !== '#owner') {
      return;
    }
    document.getElementById('owner')?.scrollIntoView();
  }, [orgPending, usersPending, orgId]);

  const createInvitationMutation = useMutation({
    mutationFn: (input: { email?: string }) =>
      adminClient.createInvitation({
        organizationId: orgId,
        role: 'member',
        ...input,
      }),
    onSuccess: (invitation) => {
      const baseUrl = window.location.origin.replace('admin.', '');
      setCreatedInviteUrl(`${baseUrl}/join/${invitation.code}`);
      setInviteEmail('');
      setIsInviteDialogOpen(false);
      setIsInviteResultDialogOpen(true);
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to create invitation');
      }
    },
  });

  const handleCreateInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    createInvitationMutation.mutate(inviteEmail ? { email: inviteEmail } : {});
  };

  const resetCreateUserForm = () => {
    setCreateUserEmail('');
    setCreateUserName('');
    setCreateUserKind('human');
    setCreateUserRole('member');
    setCreateUserError(null);
  };

  const createUserMutation = useMutation({
    mutationFn: (input: Parameters<AdminClient['createUser']>[0]) =>
      adminClient.createUser(input),
    onSuccess: () => {
      invalidateMembers();
      resetCreateUserForm();
      setIsCreateUserDialogOpen(false);
      toast.success('User created');
    },
    onError: (err) => {
      setCreateUserError(mutationErrorMessage(err, 'Failed to create user'));
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserError(null);
    createUserMutation.mutate({
      organizationId: orgId,
      email: createUserEmail,
      role: createUserRole,
      kind: createUserKind,
      ...(createUserName.trim() ? { name: createUserName.trim() } : {}),
    });
  };

  const handleCopyInviteUrl = async () => {
    if (createdInviteUrl) {
      await navigator.clipboard.writeText(createdInviteUrl);
      toast.success('Invitation URL copied to clipboard');
    }
  };

  const handleCopyOwnerInviteUrl = async (url: string | null) => {
    if (url) {
      await navigator.clipboard.writeText(url);
      toast.success(LINK_COPIED_TOAST);
    }
  };

  const issueOwnerInvitationMutation = useMutation({
    mutationFn: (input: Parameters<AdminClient['issueOwnerInvitation']>[0]) =>
      adminClient.issueOwnerInvitation(input),
    onSuccess: (issued) => {
      setOwnerSectionError(null);
      invalidateMembers();
      invalidateOwnerInvitation();
      invalidateOrganizations();
      setIsNewLinkConfirmOpen(false);
      setIsDifferentEmailOpen(false);
      setIsCreateOwnerInviteOpen(false);
      setDifferentOwnerEmail('');
      setCreateOwnerInviteEmail('');
      setExpiredFormEmail(null);

      if (issued.owner !== null) {
        const workspaceName = orgData?.name ?? 'this workspace';
        toast.success(ownerAssignedToast(memberDisplayName(issued.owner), workspaceName));
        return;
      }

      if (issued.ownerInvitation !== null) {
        setOwnerInviteUrl(joinUrlForCode(issued.ownerInvitation.code));
        setOwnerInviteEmail(issued.ownerInvitation.email);
        setIsOwnerInviteResultOpen(true);
      }
    },
    onError: (err) => {
      setOwnerSectionError(
        mutationErrorMessage(err, CREATE_OWNER_INVITE_STORAGE_MESSAGE)
      );
    },
  });

  const updateOrgMutation = useMutation({
    mutationFn: (input: Parameters<AdminClient['updateOrganization']>[0]) =>
      adminClient.updateOrganization(input),
    onMutate: async ({ name }) => {
      await queryClient.cancelQueries({
        queryKey: ['organizations', orgId],
      });
      await queryClient.cancelQueries({ queryKey: ['organizations'] });

      const previousOrg = queryClient.getQueryData<Organization>(['organizations', orgId]);
      const previousList = queryClient.getQueryData<{ organizations: AdminWorkspaceListItem[] }>([
        'organizations',
      ]);

      if (previousOrg) {
        queryClient.setQueryData<Organization>(['organizations', orgId], {
          ...previousOrg,
          name,
        });
      }

      if (previousList) {
        queryClient.setQueryData<{ organizations: AdminWorkspaceListItem[] }>(['organizations'], {
          ...previousList,
          organizations: previousList.organizations.map((org) =>
            org.id === orgId ? { ...org, name } : org
          ),
        });
      }

      setIsRenameDialogOpen(false);

      return {
        previousOrg,
        previousList,
        previousName: previousOrg?.name ?? '',
      };
    },

    onError: (err, _variables, context) => {
      if (context?.previousOrg) {
        queryClient.setQueryData(['organizations', orgId], context.previousOrg);
      }
      if (context?.previousList) {
        queryClient.setQueryData(['organizations'], context.previousList);
      }
      if (context?.previousName) {
        setNewOrgName(context.previousName);
        setIsRenameDialogOpen(true);
      }

      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to rename organization');
      }
    },

    onSuccess: () => {
      toast.success('Organization renamed');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const setOwnerMutation = useMutation({
    mutationFn: (input: Parameters<AdminClient['setOrganizationOwner']>[0]) =>
      adminClient.setOrganizationOwner(input),
    onSuccess: (_data, variables) => {
      setMemberErrors((current) => {
        const next = { ...current };
        delete next[variables.userId];
        return next;
      });
      invalidateMembers();
      invalidateOwnerInvitation();
      invalidateOrganizations();
      toast.success('Owner updated');
    },
    onError: (err, variables) => {
      setMemberErrors((current) => ({
        ...current,
        [variables.userId]: mutationErrorMessage(err, 'Failed to set owner'),
      }));
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: (input: Parameters<AdminClient['changeMemberRole']>[0]) =>
      adminClient.changeMemberRole(input),
    onSuccess: (_data, variables) => {
      setMemberErrors((current) => {
        const next = { ...current };
        delete next[variables.userId];
        return next;
      });
      invalidateMembers();
      toast.success('Role updated');
    },
    onError: (err, variables) => {
      setMemberErrors((current) => ({
        ...current,
        [variables.userId]: mutationErrorMessage(err, 'Failed to change role'),
      }));
    },
  });

  const handleRenameOrganization = (e: React.FormEvent) => {
    e.preventDefault();
    updateOrgMutation.mutate({ id: orgId, name: newOrgName });
  };

  const openRenameDialog = () => {
    if (organization) {
      setNewOrgName(organization.name);
      setIsRenameDialogOpen(true);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Error state
  if (orgError) {
    if (isNetworkFailure(orgError)) {
      return (
        <div className="container mx-auto p-6">
          <Card>
            <CardContent className="py-8 text-center">
              <WifiOff className="mx-auto mb-2 h-8 w-8 text-yellow-600" />
              <p className="text-gray-600">Unable to connect to the server.</p>
              <p className="text-sm text-gray-500">Please check your internet connection.</p>
            </CardContent>
          </Card>
        </div>
      );
    }
    if (httpStatusOf(orgError) === 404) {
      return (
        <div className="container mx-auto p-6">
          <p className="text-red-600">Organization not found</p>
          <Link to="/" className="text-blue-600 hover:underline">
            Back to Organizations
          </Link>
        </div>
      );
    }
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-8 text-center text-red-600">
            <p>Failed to load organization</p>
            <p className="text-sm">Status: {httpStatusOf(orgError)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (orgPending || usersPending) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  const organization = orgData ?? null;
  const users = usersData?.users ?? [];
  const ownerMember = users.find((user) => user.role === 'owner');
  const pendingOwnerInvitation = ownerInvitationData?.ownerInvitation ?? null;
  const expiredOwnerInvitation = ownerInvitationData?.expiredOwnerInvitation ?? null;
  const pendingOwnerInviteUrl = pendingOwnerInvitation
    ? joinUrlForCode(pendingOwnerInvitation.code)
    : null;
  const ownerInvitationReady = ownerInvitationData !== undefined;
  const isPersonalWorkspace = ownerInvitationReady && ownerInvitationData.personal === true;
  const canCreateOwnerInvite =
    ownerInvitationReady &&
    !ownerMember &&
    !pendingOwnerInvitation &&
    !isPersonalWorkspace;
  const ownerInviteEmailValue =
    expiredFormEmail ?? expiredOwnerInvitation?.email ?? '';

  if (!organization) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-red-600">Organization not found</p>
        <Link to="/" className="text-blue-600 hover:underline">
          Back to Organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Breadcrumbs */}
      <nav className="mb-4 text-sm text-gray-500">
        <Link to="/" className="hover:text-gray-700">
          Organizations
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{organization.name}</span>
      </nav>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{organization.name}</h1>
          <p className="text-gray-500">Created {formatDate(organization.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog
            open={isCreateUserDialogOpen}
            onOpenChange={(open) => {
              setIsCreateUserDialogOpen(open);
              if (!open) {
                resetCreateUserForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" data-action="create-user">
                <UserPlus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateUser}>
                <DialogHeader>
                  <DialogTitle>Create User</DialogTitle>
                  <DialogDescription>
                    Add a person or bot to {organization.name}. {BOT_CANNOT_BE_ADMIN_MESSAGE}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="createUserEmail">Email</Label>
                    <Input
                      id="createUserEmail"
                      type="email"
                      value={createUserEmail}
                      onChange={(e) => setCreateUserEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="createUserName">Name (optional)</Label>
                    <Input
                      id="createUserName"
                      type="text"
                      value={createUserName}
                      onChange={(e) => setCreateUserName(e.target.value)}
                      placeholder="Display name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="createUserKind">Kind</Label>
                    <select
                      id="createUserKind"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={createUserKind}
                      onChange={(e) => {
                        const kind = parseCreateUserKind(e.target.value);
                        if (kind) {
                          setCreateUserKind(kind);
                        }
                      }}
                    >
                      <option value="human">Human</option>
                      <option value="agent">Bot</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="createUserRole">Role</Label>
                    <select
                      id="createUserRole"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={createUserRole}
                      onChange={(e) => {
                        const role = parseCreateUserRole(e.target.value);
                        if (role) {
                          setCreateUserRole(role);
                        }
                      }}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  {createUserError ? (
                    <p className="text-sm text-red-600" data-create-user-error="">
                      {createUserError}
                    </p>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createUserMutation.isPending}>
                    {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={openRenameDialog}>
                Rename
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleRenameOrganization}>
                <DialogHeader>
                  <DialogTitle>Rename Organization</DialogTitle>
                  <DialogDescription>
                    Enter a new name for this organization.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="orgName">Name</Label>
                    <Input
                      id="orgName"
                      type="text"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="Enter organization name"
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={updateOrgMutation.isPending}>
                    {updateOrgMutation.isPending ? 'Renaming...' : 'Rename'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Mail className="mr-2 h-4 w-4" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateInvitation}>
                <DialogHeader>
                  <DialogTitle>Invite User</DialogTitle>
                  <DialogDescription>
                    Create an invitation link for {organization.name}. Optionally restrict to a specific email.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email (optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="Enter email or leave blank for open invite"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createInvitationMutation.isPending}>
                    {createInvitationMutation.isPending ? 'Creating...' : 'Create Invitation'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Invitation Created Result Dialog */}
          <Dialog open={isInviteResultDialogOpen} onOpenChange={setIsInviteResultDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invitation Created</DialogTitle>
                <DialogDescription>
                  Share this link with the user you want to invite. The link will expire in 7 days.
                </DialogDescription>
              </DialogHeader>
              <div className="my-4">
                <div className="rounded-md bg-gray-100 p-3">
                  <code className="break-all text-sm">{createdInviteUrl}</code>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCopyInviteUrl}>
                  Copy to Clipboard
                </Button>
                <Button onClick={() => setIsInviteResultDialogOpen(false)}>Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div data-owner-users-panel>
      <Card className="mb-6" id="owner" data-owner-section>
        <CardHeader>
          <CardTitle>Owner</CardTitle>
          <CardDescription>
            Each workspace has one owner. Issue an owner invite when the workspace does not have one yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ownerMember ? (
            <p data-owner-name>{ownerLabel(ownerMember.name ?? ownerMember.email)}</p>
          ) : pendingOwnerInvitation ? (
            <div className="space-y-3">
              <p data-owner-invite-pending>
                {ownerInvitePending(
                  pendingOwnerInvitation.email,
                  formatInviteDate(pendingOwnerInvitation.expiresAt)
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-action="copy-owner-link"
                  onClick={() => handleCopyOwnerInviteUrl(pendingOwnerInviteUrl)}
                >
                  {COPY_LINK_LABEL}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-action="new-owner-link"
                  onClick={() => setIsNewLinkConfirmOpen(true)}
                >
                  {NEW_LINK_LABEL}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-action="use-different-owner-email"
                  onClick={() => setIsDifferentEmailOpen(true)}
                >
                  {USE_DIFFERENT_EMAIL_LABEL}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {expiredOwnerInvitation ? (
                <p data-owner-invite-expired>
                  {ownerInviteExpired(
                    expiredOwnerInvitation.email,
                    formatInviteDate(expiredOwnerInvitation.expiredAt)
                  )}
                </p>
              ) : null}
              {canCreateOwnerInvite && expiredOwnerInvitation ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    issueOwnerInvitationMutation.mutate({
                      id: orgId,
                      email: ownerInviteEmailValue,
                    });
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="create-owner-invite-email">{OWNER_EMAIL_LABEL}</Label>
                    <Input
                      id="create-owner-invite-email"
                      type="email"
                      value={ownerInviteEmailValue}
                      onChange={(event) => setExpiredFormEmail(event.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" data-action="create-owner-invite">
                    {CREATE_OWNER_INVITE_LABEL}
                  </Button>
                </form>
              ) : null}
              {canCreateOwnerInvite && !expiredOwnerInvitation ? (
                <Button
                  type="button"
                  data-action="create-owner-invite"
                  onClick={() => {
                    setCreateOwnerInviteEmail('');
                    setIsCreateOwnerInviteOpen(true);
                  }}
                >
                  {CREATE_OWNER_INVITE_LABEL}
                </Button>
              ) : null}
            </div>
          )}
          {ownerSectionError ? (
            <p className="text-sm text-red-600" data-owner-section-error>
              {ownerSectionError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={isNewLinkConfirmOpen} onOpenChange={setIsNewLinkConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{NEW_LINK_LABEL}</DialogTitle>
            <DialogDescription>
              {pendingOwnerInvitation
                ? newLinkConfirm(pendingOwnerInvitation.email)
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewLinkConfirmOpen(false)}>
              {CANCEL_LABEL}
            </Button>
            <Button
              data-action="make-new-link"
              disabled={issueOwnerInvitationMutation.isPending || pendingOwnerInvitation === null}
              onClick={() => {
                if (pendingOwnerInvitation) {
                  issueOwnerInvitationMutation.mutate({
                    id: orgId,
                    email: pendingOwnerInvitation.email,
                  });
                }
              }}
            >
              {MAKE_NEW_LINK_LABEL}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDifferentEmailOpen} onOpenChange={setIsDifferentEmailOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              issueOwnerInvitationMutation.mutate({
                id: orgId,
                email: differentOwnerEmail,
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{USE_DIFFERENT_EMAIL_LABEL}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="different-owner-email">{OWNER_EMAIL_LABEL}</Label>
              <Input
                id="different-owner-email"
                type="email"
                value={differentOwnerEmail}
                onChange={(event) => setDifferentOwnerEmail(event.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={issueOwnerInvitationMutation.isPending}>
                {CREATE_OWNER_INVITE_LABEL}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOwnerInviteOpen} onOpenChange={setIsCreateOwnerInviteOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              issueOwnerInvitationMutation.mutate({
                id: orgId,
                email: createOwnerInviteEmail,
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{CREATE_OWNER_INVITE_LABEL}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="dialog-create-owner-invite-email">{OWNER_EMAIL_LABEL}</Label>
              <Input
                id="dialog-create-owner-invite-email"
                type="email"
                value={createOwnerInviteEmail}
                onChange={(event) => setCreateOwnerInviteEmail(event.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                data-action="submit-create-owner-invite"
                disabled={issueOwnerInvitationMutation.isPending}
              >
                {CREATE_OWNER_INVITE_LABEL}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isOwnerInviteResultOpen} onOpenChange={setIsOwnerInviteResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Owner invite</DialogTitle>
            <DialogDescription>
              {ownerInviteEmail ? ownerInviteCreatedMessage(ownerInviteEmail) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <div className="rounded-md bg-gray-100 p-3">
              <code className="break-all text-sm">{ownerInviteUrl}</code>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              data-action="copy-owner-link"
              onClick={() => handleCopyOwnerInviteUrl(ownerInviteUrl)}
            >
              {COPY_LINK_LABEL}
            </Button>
            <Button onClick={() => setIsOwnerInviteResultOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Each workspace has at most one owner. Set the owner here; the previous owner becomes an admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-gray-500">
              No users yet. Invite someone to get started.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="hidden text-sm font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,2fr)_6rem_6rem_minmax(0,1fr)] md:gap-3">
                <div>Email</div>
                <div>Kind</div>
                <div>Role</div>
                <div>Actions</div>
              </div>
              {users.map((user) => {
                const kind = user.kind ?? 'human';
                const isHuman = kind !== 'agent';
                const isOwner = user.role === 'owner';
                return (
                  <div
                    key={user.id}
                    data-user-id={user.id}
                    data-role={user.role ?? ''}
                    className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,2fr)_6rem_6rem_minmax(0,1fr)] md:items-start md:border-0 md:p-0 md:py-3"
                  >
                    <button
                      type="button"
                      className="break-all text-left font-medium hover:underline"
                      onClick={() =>
                        navigate({
                          to: '/users/$userId',
                          params: { userId: user.id },
                          search: { orgId },
                        })
                      }
                    >
                      {user.name ?? user.email}
                    </button>
                    <div className="text-sm text-gray-500 md:text-gray-900">
                      <span className="md:hidden">Kind: </span>
                      {isHuman ? 'Human' : 'Bot'}
                    </div>
                    <div className="text-sm capitalize text-gray-500 md:text-gray-900">
                      <span className="md:hidden">Role: </span>
                      {user.role ?? '—'}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {isHuman && !isOwner ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            data-action="make-owner"
                            disabled={setOwnerMutation.isPending}
                            onClick={() =>
                              setOwnerMutation.mutate({ id: orgId, userId: user.id })
                            }
                          >
                            Make owner
                          </Button>
                        ) : null}
                        {isHuman && !isOwner ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            data-action="toggle-admin"
                            disabled={changeRoleMutation.isPending}
                            onClick={() =>
                              changeRoleMutation.mutate({
                                id: orgId,
                                userId: user.id,
                                role: user.role === 'admin' ? 'member' : 'admin',
                              })
                            }
                          >
                            {user.role === 'admin' ? 'Make member' : 'Make admin'}
                          </Button>
                        ) : null}
                      </div>
                      {memberErrors[user.id] ? (
                        <p className="text-sm text-red-600" data-member-error={user.id}>
                          {memberErrors[user.id]}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
