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
import { toast } from 'sonner';

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
    onMutate: async ({ body }) => {
      // Cancel in-flight queries to prevent overwrites
      await tsrQueryClient.cancelQueries({ queryKey: ['organizations'] });

      // Snapshot current state for rollback
      const previousData = tsrQueryClient.listOrganizations.getQueryData([
        'organizations',
      ]);

      // Create optimistic organization with temp ID
      const optimisticOrg = {
        id: `temp-${Date.now()}`,
        name: body.name,
        createdAt: new Date().toISOString(),
      };

      if (previousData?.status === 200) {
        tsrQueryClient.listOrganizations.setQueryData(['organizations'], {
          ...previousData,
          body: {
            ...previousData.body,
            organizations: [...previousData.body.organizations, optimisticOrg],
          },
        });
      }

      // Clear form and close dialog immediately for snappy UX
      setNewOrgName('');
      setIsDialogOpen(false);

      return { previousData, previousName: body.name };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        tsrQueryClient.listOrganizations.setQueryData(
          ['organizations'],
          context.previousData
        );
      }
      // Restore the form so user doesn't lose their input
      if (context?.previousName) {
        setNewOrgName(context.previousName);
        setIsDialogOpen(true);
      }

      // Show error toast
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to create organization');
      }
    },

    onSuccess: () => {
      toast.success('Organization created');
    },

    onSettled: () => {
      // Refetch to ensure consistency with server (replaces temp ID with real one)
      tsrQueryClient.invalidateQueries({ queryKey: ['organizations'] });
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
