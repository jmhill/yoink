import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
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
import { adminClient, httpStatusOf, isNetworkFailure, type AdminClient } from '@/api/client';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';

// User belongs to org via membership, so we pass orgId as a search param
const userSearchSchema = z.object({
  orgId: z.string().uuid(),
});

export const Route = createFileRoute('/_authenticated/users/$userId')({
  component: UserDetailPage,
  validateSearch: userSearchSchema,
});

function UserDetailPage() {
  const { userId } = Route.useParams();
  const { orgId } = Route.useSearch();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: userData, isPending: userPending, error: userError } = useQuery({
    queryKey: ['users', userId],
    queryFn: () => adminClient.getUser({ id: userId }),
  });

  const user = userData ?? null;

  const { data: orgData, isPending: orgPending } = useQuery({
    queryKey: ['organizations', orgId],
    queryFn: () => adminClient.getOrganization({ id: orgId }),
  });

  const { data: tokensData, isPending: tokensPending } = useQuery({
    queryKey: ['organizations', orgId, 'tokens'],
    queryFn: () => adminClient.listTokens({ organizationId: orgId }),
  });

  const createTokenMutation = useMutation({
    mutationFn: (input: Parameters<AdminClient['createToken']>[0]) =>
      adminClient.createToken(input),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'tokens'] });
      setCreatedToken(created.rawToken);
      setNewTokenName('');
      setIsCreateDialogOpen(false);
      setIsTokenDialogOpen(true);
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (input: Parameters<AdminClient['revokeToken']>[0]) =>
      adminClient.revokeToken(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'tokens'] });
      toast.success('Token revoked');
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to revoke token');
      }
    },
  });

  const handleCreateToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    createTokenMutation.mutate({ organizationId: orgId, userId, name: newTokenName });
  };

  const handleRevokeToken = (tokenId: string, tokenName: string) => {
    if (!confirm(`Are you sure you want to revoke the token "${tokenName}"?`)) {
      return;
    }
    revokeTokenMutation.mutate({ id: tokenId });
  };

  const handleCopyToken = async () => {
    if (createdToken) {
      await navigator.clipboard.writeText(createdToken);
      toast.success('Token copied to clipboard');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Error state
  if (userError) {
    if (isNetworkFailure(userError)) {
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
    if (httpStatusOf(userError) === 404) {
      return (
        <div className="container mx-auto p-6">
          <p className="text-red-600">User not found</p>
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
            <p>Failed to load user</p>
            <p className="text-sm">Status: {httpStatusOf(userError)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (userPending || orgPending || tokensPending) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  const organization = orgData ?? null;
  const allTokens = tokensData?.tokens ?? [];
  const tokens = allTokens.filter(token => token.userId === userId);

  if (!user || !organization) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-red-600">User not found</p>
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
        <Link
          to="/organizations/$orgId"
          params={{ orgId: organization.id }}
          className="hover:text-gray-700"
        >
          {organization.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{user.email}</span>
      </nav>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{user.email}</h1>
          <p className="text-gray-500">Created {formatDate(user.createdAt)}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>Create Token</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateToken}>
              <DialogHeader>
                <DialogTitle>Create API Token</DialogTitle>
                <DialogDescription>
                  Create a new API token for {user.email}.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="tokenName">Token Name</Label>
                  <Input
                    id="tokenName"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    placeholder="e.g., my-laptop, mobile-app"
                    required
                  />
                </div>
              </div>
              {createTokenMutation.error && (
                <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-600">
                  Failed to create token
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={createTokenMutation.isPending}>
                  {createTokenMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Token Created Dialog */}
      <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token Created</DialogTitle>
            <DialogDescription className="text-amber-600">
              This token will only be shown once. Copy it now and store it
              securely.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <div className="rounded-md bg-gray-100 p-3">
              <code className="break-all text-sm">{createdToken}</code>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCopyToken}>
              Copy to Clipboard
            </Button>
            <Button onClick={() => setIsTokenDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>API Tokens</CardTitle>
          <CardDescription>
            Tokens allow this user to access the capture API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-gray-500">
              No tokens yet. Create one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell>
                      {token.lastUsedAt
                        ? formatDate(token.lastUsedAt)
                        : 'Never'}
                    </TableCell>
                    <TableCell>{formatDate(token.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRevokeToken(token.id, token.name)}
                        disabled={revokeTokenMutation.isPending}
                      >
                        Revoke
                      </Button>
                    </TableCell>
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
