import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
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
import { adminApi } from '@/api/client';
import type { Organization, User, ApiToken } from '@yoink/api-contracts';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/users/$userId')({
  component: UserDetailPage,
});

function UserDetailPage() {
  const { userId } = Route.useParams();
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const userResponse = await adminApi.getUser({ params: { id: userId } });

      if (userResponse.status === 200) {
        setUser(userResponse.body);

        // Load organization and tokens
        const [orgResponse, tokensResponse] = await Promise.all([
          adminApi.getOrganization({
            params: { id: userResponse.body.organizationId },
          }),
          adminApi.listTokens({ params: { userId } }),
        ]);

        if (orgResponse.status === 200) {
          setOrganization(orgResponse.body);
        }
        if (tokensResponse.status === 200) {
          setTokens(tokensResponse.body.tokens);
        }
      } else if (userResponse.status === 404) {
        setError('User not found');
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const response = await adminApi.createToken({
        params: { userId },
        body: { name: newTokenName },
      });

      if (response.status === 201) {
        setTokens((prev) => [...prev, response.body.token]);
        setCreatedToken(response.body.rawToken);
        setNewTokenName('');
        setIsCreateDialogOpen(false);
        setIsTokenDialogOpen(true);
      } else {
        setError('Failed to create token');
      }
    } catch {
      setError('Failed to create token');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeToken = async (tokenId: string, tokenName: string) => {
    if (!confirm(`Are you sure you want to revoke the token "${tokenName}"?`)) {
      return;
    }

    try {
      const response = await adminApi.revokeToken({ params: { id: tokenId } });
      if (response.status === 204) {
        setTokens((prev) => prev.filter((t) => t.id !== tokenId));
        toast.success('Token revoked');
      } else {
        toast.error('Failed to revoke token');
      }
    } catch {
      toast.error('Failed to revoke token');
    }
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

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user || !organization) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-red-600">{error || 'User not found'}</p>
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
              <DialogFooter>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create'}
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

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

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
