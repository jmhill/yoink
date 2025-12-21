import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { tsrAdmin } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
import { WifiOff } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/organizations/$orgId')({
  component: OrganizationDetailPage,
});

function OrganizationDetailPage() {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
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

  const createUserMutation = tsrAdmin.createUser.useMutation({
    onSuccess: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'users'] });
      setNewUserEmail('');
      setIsDialogOpen(false);
    },
  });

  const updateOrgMutation = tsrAdmin.updateOrganization.useMutation({
    onSuccess: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['organizations', orgId] });
      setIsRenameDialogOpen(false);
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate({
      params: { organizationId: orgId },
      body: { email: newUserEmail },
    });
  };

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
                {updateOrgMutation.error && (
                  <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-600">
                    Failed to rename organization
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit" disabled={updateOrgMutation.isPending}>
                    {updateOrgMutation.isPending ? 'Renaming...' : 'Rename'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>Create User</Button>
            </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateUser}>
              <DialogHeader>
                <DialogTitle>Create User</DialogTitle>
                <DialogDescription>
                  Add a new user to {organization.name}.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="Enter user email"
                    required
                  />
                </div>
              </div>
              {createUserMutation.error && (
                <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-600">
                  Failed to create user
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Click on a user to manage their API tokens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-gray-500">
              No users yet. Create one to get started.
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
