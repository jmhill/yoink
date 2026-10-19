import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@yoink/ui-base/components/table';
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
  COPY_LINK_LABEL,
  CREATE_WORKSPACE_STORAGE_MESSAGE,
  LINK_COPIED_TOAST,
  NO_OWNER_BADGE,
  OWNER_EMAIL_HELP,
  OWNER_EMAIL_LABEL,
  WAITING_FOR_OWNER_BADGE,
  memberDisplayName,
  ownerAssignedToast,
  ownerInviteCreatedMessage,
  type AdminWorkspaceListItem,
} from '@yoink/api-contracts';
import { tsrAdmin, tsrPublic } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/')({
  component: OrganizationsPage,
});

const joinUrlForCode = (code: string): string => {
  const baseUrl = window.location.origin.replace('admin.', '');
  return `${baseUrl}/join/${code}`;
};

const ownerBadgeKind = (
  workspace: AdminWorkspaceListItem
): 'no-owner' | 'waiting-for-owner' | null => {
  if (workspace.personal) {
    return null;
  }
  switch (workspace.ownerStatus.kind) {
    case 'has-owner':
      return null;
    case 'waiting-for-owner':
      return 'waiting-for-owner';
    case 'no-owner':
      return 'no-owner';
    default: {
      const _never: never = workspace.ownerStatus;
      return _never;
    }
  }
};

const messageFromBody = (body: unknown, fallback: string): string => {
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

function OrganizationsPage() {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [createdInviteEmail, setCreatedInviteEmail] = useState<string | null>(null);
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [isInviteResultOpen, setIsInviteResultOpen] = useState(false);
  const tsrQueryClient = tsrAdmin.useQueryClient();

  const { data, isPending, error } = tsrAdmin.listOrganizations.useQuery({
    queryKey: ['organizations'],
  });

  const resetCreateForm = () => {
    setNewOrgName('');
    setOwnerEmail('');
    setCreateError(null);
  };

  const createMutation = tsrAdmin.createOrganization.useMutation({
    onSuccess: (response) => {
      if (response.status !== 201) {
        setCreateError(messageFromBody(response.body, CREATE_WORKSPACE_STORAGE_MESSAGE));
        return;
      }

      const { organization, owner, ownerInvitation } = response.body;
      resetCreateForm();
      setIsDialogOpen(false);
      tsrQueryClient.invalidateQueries({ queryKey: ['organizations'] });

      if (owner !== null) {
        toast.success(ownerAssignedToast(memberDisplayName(owner), organization.name));
        navigate({
          to: '/organizations/$orgId',
          params: { orgId: organization.id },
        });
        return;
      }

      if (ownerInvitation !== null) {
        setCreatedInviteUrl(joinUrlForCode(ownerInvitation.code));
        setCreatedInviteEmail(ownerInvitation.email);
        setCreatedOrgId(organization.id);
        setIsInviteResultOpen(true);
      }
    },
    onError: (err) => {
      if (isFetchError(err)) {
        setCreateError('Network error. Please check your connection.');
        return;
      }
      if (typeof err === 'object' && err !== null && 'body' in err) {
        setCreateError(messageFromBody(err.body, CREATE_WORKSPACE_STORAGE_MESSAGE));
        return;
      }
      setCreateError(CREATE_WORKSPACE_STORAGE_MESSAGE);
    },
  });

  const handleCreateOrganization = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    createMutation.mutate({
      body: { name: newOrgName, ownerEmail },
    });
  };

  const handleCopyInviteUrl = async () => {
    if (createdInviteUrl) {
      await navigator.clipboard.writeText(createdInviteUrl);
      toast.success(LINK_COPIED_TOAST);
    }
  };

  const handleInviteResultOpenChange = (open: boolean) => {
    setIsInviteResultOpen(open);
    if (!open && createdOrgId) {
      const orgId = createdOrgId;
      setCreatedOrgId(null);
      setCreatedInviteUrl(null);
      setCreatedInviteEmail(null);
      navigate({
        to: '/organizations/$orgId',
        params: { orgId },
      });
    }
  };

  const handleLogout = async () => {
    await tsrPublic.logout.mutate({ body: {} });
    navigate({ to: '/login' });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (error) {
    if (isFetchError(error)) {
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
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-8 text-center text-red-600">
            <p>Failed to load organizations</p>
            <p className="text-sm">Status: {error.status}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  const organizations = data?.status === 200 ? data.body.organizations : [];

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Organizations</h1>
        <div className="flex gap-2">
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                resetCreateForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button data-action="create-workspace">Create Organization</Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateOrganization}>
                <DialogHeader>
                  <DialogTitle>Create Organization</DialogTitle>
                  <DialogDescription>
                    Add a new organization to manage users and tokens.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Organization Name</Label>
                    <Input
                      id="name"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="Enter organization name"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="owner-email">{OWNER_EMAIL_LABEL}</Label>
                    <Input
                      id="owner-email"
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="owner@example.com"
                      required
                    />
                    <p className="text-sm text-muted-foreground">{OWNER_EMAIL_HELP}</p>
                  </div>
                  {createError ? (
                    <p className="text-sm text-red-600" data-create-workspace-error>
                      {createError}
                    </p>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      <Dialog open={isInviteResultOpen} onOpenChange={handleInviteResultOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Owner invite</DialogTitle>
            <DialogDescription>
              {createdInviteEmail ? ownerInviteCreatedMessage(createdInviteEmail) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <div className="rounded-md bg-gray-100 p-3">
              <code className="break-all text-sm">{createdInviteUrl}</code>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCopyInviteUrl} data-action="copy-owner-link">
              {COPY_LINK_LABEL}
            </Button>
            <Button onClick={() => handleInviteResultOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>All Organizations</CardTitle>
          <CardDescription>
            Click on an organization to manage its users and tokens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <p className="text-gray-500">
              No organizations yet. Create one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((org) => {
                  const badge = ownerBadgeKind(org);
                  return (
                    <TableRow
                      key={org.id}
                      data-organization-id={org.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() =>
                        navigate({
                          to: '/organizations/$orgId',
                          params: { orgId: org.id },
                        })
                      }
                    >
                      <TableCell className="font-medium">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span>{org.name}</span>
                          {badge === 'no-owner' ? (
                            <Link
                              to="/organizations/$orgId"
                              params={{ orgId: org.id }}
                              hash="owner"
                              data-owner-badge="no-owner"
                              className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {NO_OWNER_BADGE}
                            </Link>
                          ) : null}
                          {badge === 'waiting-for-owner' ? (
                            <Link
                              to="/organizations/$orgId"
                              params={{ orgId: org.id }}
                              hash="owner"
                              data-owner-badge="waiting-for-owner"
                              className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {WAITING_FOR_OWNER_BADGE}
                            </Link>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(org.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
