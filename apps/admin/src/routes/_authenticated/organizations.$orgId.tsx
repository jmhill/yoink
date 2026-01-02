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
import { tsrAdmin } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
import { WifiOff, Mail } from 'lucide-react';
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
  const tsrQueryClient = tsrAdmin.useQueryClient();

  const { data: orgData, isPending: orgPending, error: orgError } = tsrAdmin.getOrganization.useQuery({
    queryKey: ['organizations', orgId],
    queryData: { params: { id: orgId } },
  });

  const { data: usersData, isPending: usersPending } = tsrAdmin.listUsers.useQuery({
    queryKey: ['organizations', orgId, 'users'],
    queryData: { params: { organizationId: orgId } },
  });

  const createInvitationMutation = tsrAdmin.createInvitation.useMutation({
    onSuccess: (data) => {
      if (data.status === 201) {
        // Construct the invitation URL from the code
        const baseUrl = window.location.origin.replace('admin.', '');
        setCreatedInviteUrl(`${baseUrl}/join/${data.body.code}`);
        setInviteEmail('');
        setIsInviteDialogOpen(false);
        setIsInviteResultDialogOpen(true);
      }
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to create invitation');
      }
    },
  });

  const handleCreateInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    createInvitationMutation.mutate({
      params: { organizationId: orgId },
      body: {
        role: 'member',
        ...(inviteEmail ? { email: inviteEmail } : {}),
      },
    });
  };

  const handleCopyInviteUrl = async () => {
    if (createdInviteUrl) {
      await navigator.clipboard.writeText(createdInviteUrl);
      toast.success('Invitation URL copied to clipboard');
    }
  };

  const updateOrgMutation = tsrAdmin.updateOrganization.useMutation({
    onMutate: async ({ body }) => {
      // Cancel in-flight queries to prevent overwrites
      await tsrQueryClient.cancelQueries({
        queryKey: ['organizations', orgId],
      });
      await tsrQueryClient.cancelQueries({ queryKey: ['organizations'] });

      // Snapshot current state for rollback
      const previousOrg = tsrQueryClient.getOrganization.getQueryData([
        'organizations',
        orgId,
      ]);
      const previousList = tsrQueryClient.listOrganizations.getQueryData([
        'organizations',
      ]);

      // Optimistically update org detail
      if (previousOrg?.status === 200) {
        tsrQueryClient.getOrganization.setQueryData(['organizations', orgId], {
          ...previousOrg,
          body: { ...previousOrg.body, name: body.name },
        });
      }

      // Also update in org list if cached
      if (previousList?.status === 200) {
        tsrQueryClient.listOrganizations.setQueryData(['organizations'], {
          ...previousList,
          body: {
            ...previousList.body,
            organizations: previousList.body.organizations.map((org) =>
              org.id === orgId ? { ...org, name: body.name } : org
            ),
          },
        });
      }

      // Close dialog immediately for snappy UX
      setIsRenameDialogOpen(false);

      return {
        previousOrg,
        previousList,
        previousName: previousOrg?.status === 200 ? previousOrg.body.name : '',
      };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousOrg) {
        tsrQueryClient.getOrganization.setQueryData(
          ['organizations', orgId],
          context.previousOrg
        );
      }
      if (context?.previousList) {
        tsrQueryClient.listOrganizations.setQueryData(
          ['organizations'],
          context.previousList
        );
      }
      // Restore the dialog so user can retry
      if (context?.previousName) {
        setNewOrgName(context.previousName);
        setIsRenameDialogOpen(true);
      }

      // Show error toast
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to rename organization');
      }
    },

    onSuccess: () => {
      toast.success('Organization renamed');
    },

    onSettled: () => {
      // Refetch to ensure consistency with server
      tsrQueryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const handleRenameOrganization = (e: React.FormEvent) => {
    e.preventDefault();
    updateOrgMutation.mutate({
      params: { id: orgId },
      body: { name: newOrgName },
    });
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
    if (isFetchError(orgError)) {
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
    if (orgError.status === 404) {
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
            <p className="text-sm">Status: {orgError.status}</p>
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

  const organization = orgData?.status === 200 ? orgData.body : null;
  const users = usersData?.status === 200 ? usersData.body.users : [];

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
        <div className="flex gap-2">
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

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Click on a user to manage their API tokens. Invite new users with the button above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-gray-500">
              No users yet. Invite someone to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() =>
                      navigate({
                        to: '/users/$userId',
                        params: { userId: user.id },
                        search: { orgId },
                      })
                    }
                  >
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
