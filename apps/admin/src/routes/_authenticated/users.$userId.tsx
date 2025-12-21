import { createFileRoute, Link } from '@tanstack/react-router';
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
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/users/$userId')({
  component: UserDetailPage,
});

function UserDetailPage() {
  const { userId } = Route.useParams();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const tsrQueryClient = tsrAdmin.useQueryClient();

  const { data: userData, isPending: userPending, error: userError } = tsrAdmin.getUser.useQuery({
    queryKey: ['users', userId],
    queryData: { params: { id: userId } },
  });

  const user = userData?.status === 200 ? userData.body : null;

  // Fetch organization once we have the user
  const { data: orgData, isPending: orgPending } = tsrAdmin.getOrganization.useQuery({
    queryKey: ['organizations', user?.organizationId ?? ''],
    queryData: { params: { id: user?.organizationId ?? '' } },
    enabled: !!user?.organizationId,
  });

  const { data: tokensData, isPending: tokensPending } = tsrAdmin.listTokens.useQuery({
    queryKey: ['users', userId, 'tokens'],
    queryData: { params: { userId } },
  });

  const createTokenMutation = tsrAdmin.createToken.useMutation({
    onSuccess: (data) => {
      if (data.status === 201) {
        tsrQueryClient.invalidateQueries({ queryKey: ['users', userId, 'tokens'] });
        setCreatedToken(data.body.rawToken);
        setNewTokenName('');
        setIsCreateDialogOpen(false);
        setIsTokenDialogOpen(true);
      }
    },
  });

  const revokeTokenMutation = tsrAdmin.revokeToken.useMutation({
    onSuccess: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['users', userId, 'tokens'] });
      toast.success('Token revoked');
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to revoke token');
      }
    },
  });

  const handleCreateToken = (e: React.FormEvent) => {
    e.preventDefault();
    createTokenMutation.mutate({
      params: { userId },
      body: { name: newTokenName },
    });
  };

  const handleRevokeToken = (tokenId: string, tokenName: string) => {
    if (!confirm(`Are you sure you want to revoke the token "${tokenName}"?`)) {
      return;
    }
    revokeTokenMutation.mutate({ params: { id: tokenId } });
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
    if (isFetchError(userError)) {
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
    if (userError.status === 404) {
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
            <p className="text-sm">Status: {userError.status}</p>
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

  const organization = orgData?.status === 200 ? orgData.body : null;
  const tokens = tokensData?.status === 200 ? tokensData.body.tokens : [];

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
