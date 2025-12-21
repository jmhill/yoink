import { createFileRoute, useNavigate } from '@tanstack/react-router';
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
import { tsrAdmin, tsrPublic } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
import { WifiOff } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/')({
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const tsrQueryClient = tsrAdmin.useQueryClient();

  const { data, isPending, error } = tsrAdmin.listOrganizations.useQuery({
    queryKey: ['organizations'],
  });

  const createMutation = tsrAdmin.createOrganization.useMutation({
    onSuccess: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['organizations'] });
      setNewOrgName('');
      setIsDialogOpen(false);
    },
  });

  const handleCreateOrganization = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      body: { name: newOrgName },
    });
  };

  const handleLogout = async () => {
    await tsrPublic.logout.mutate({ body: {} });
    navigate({ to: '/login' });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Error state
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
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>Create Organization</Button>
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
                </div>
                {createMutation.error && (
                  <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-600">
                    Failed to create organization
                  </div>
                )}
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
                {organizations.map((org) => (
                  <TableRow
                    key={org.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() =>
                      navigate({
                        to: '/organizations/$orgId',
                        params: { orgId: org.id },
                      })
                    }
                  >
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>{formatDate(org.createdAt)}</TableCell>
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
