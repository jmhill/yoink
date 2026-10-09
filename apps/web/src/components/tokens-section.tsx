import { useState, useEffect } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import { Key, Plus, Trash2, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import type { TokenInfo } from '@yoink/api-contracts';
import { tsrTokens } from '@/api/client';

const errorBodyMessage = (body: unknown): string | null => {
  if (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    return body.message;
  }
  return null;
};

export function TokensSection() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<TokenInfo | null>(null);

  const listQuery = tsrTokens.list.useQuery({
    queryKey: ['tokens'],
    queryData: {},
  });

  const listBody = listQuery.data?.status === 200 ? listQuery.data.body : undefined;
  const listError = listQuery.error
    ? 'Failed to list tokens'
    : listQuery.data && listQuery.data.status !== 200
      ? errorBodyMessage(listQuery.data.body) ?? 'Failed to list tokens'
      : null;

  const handleCreateSuccess = () => {
    setCreateDialogOpen(false);
    void listQuery.refetch();
  };

  const handleDeleteClick = (token: TokenInfo) => {
    setTokenToDelete(token);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSuccess = () => {
    setDeleteDialogOpen(false);
    setTokenToDelete(null);
    void listQuery.refetch();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Tokens
          </CardTitle>
          <CardDescription>
            Manage tokens for browser extension and CLI access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {listQuery.isPending && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {listError && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {listError}
            </div>
          )}

          {listBody && (
            <>
              <div className="space-y-2">
                {listBody.tokens.map((token) => (
                  <TokenItem
                    key={token.id}
                    token={token}
                    onDelete={() => handleDeleteClick(token)}
                  />
                ))}
                {listBody.tokens.length === 0 && (
                  <p className="text-muted-foreground text-sm py-2">
                    No API tokens. Create one to use with the browser extension or CLI.
                  </p>
                )}
              </div>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Token
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <CreateTokenDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      <DeleteTokenDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        token={tokenToDelete}
        onSuccess={handleDeleteSuccess}
      />
    </>
  );
}

type TokenItemProps = {
  token: TokenInfo;
  onDelete: () => void;
};

function TokenItem({ token, onDelete }: TokenItemProps) {
  const createdDate = new Date(token.createdAt).toLocaleDateString();
  const lastUsedDate = token.lastUsedAt
    ? new Date(token.lastUsedAt).toLocaleDateString()
    : 'Never';
  const displayName = token.name ?? 'Token';

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border bg-card"
      data-token-row={displayName}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-full bg-muted">
          <Key className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">
            {displayName}
          </p>
          <p className="text-xs text-muted-foreground">
            Created {createdDate} · Last used {lastUsedDate}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        title={token.name ? `Revoke ${token.name}` : 'Revoke token'}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  );
}

type CreateTokenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

function CreateTokenDialog({ open, onOpenChange, onSuccess }: CreateTokenDialogProps) {
  const [tokenName, setTokenName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = tsrTokens.create.useMutation({
    onSuccess: (result) => {
      if (result.status === 201) {
        setRawToken(result.body.rawToken);
        return;
      }
      setError(errorBodyMessage(result.body) ?? 'Failed to create token');
    },
    onError: () => {
      setError('Failed to create token');
    },
  });

  useEffect(() => {
    if (open) {
      setTokenName('');
      setError(null);
      setRawToken(null);
      setCopied(false);
    }
  }, [open]);

  const handleCreate = () => {
    if (!tokenName.trim()) {
      setError('Token name is required');
      return;
    }

    setError(null);
    createMutation.mutate({ body: { name: tokenName.trim() } });
  };

  const handleCopy = async () => {
    if (rawToken) {
      await navigator.clipboard.writeText(rawToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (rawToken) {
      onSuccess();
    }
  };

  if (rawToken) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Token Created
            </DialogTitle>
            <DialogDescription>
              Copy your token now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 rounded-lg border bg-muted font-mono text-sm break-all">
              {rawToken}
            </div>

            <Button onClick={handleCopy} className="w-full" variant="outline">
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>

            <div className="flex items-center gap-2 text-amber-600 text-sm p-3 rounded-lg bg-amber-50 dark:bg-amber-950 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Store this token securely. It cannot be recovered.</span>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Create API Token
          </DialogTitle>
          <DialogDescription>
            Create a token for the browser extension or CLI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token-name">Label</Label>
            <Input
              id="token-name"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="Browser extension"
              disabled={createMutation.isPending}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Token'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DeleteTokenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: TokenInfo | null;
  onSuccess: () => void;
};

function DeleteTokenDialog({
  open,
  onOpenChange,
  token,
  onSuccess,
}: DeleteTokenDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const revokeMutation = tsrTokens.delete.useMutation({
    onSuccess: (result) => {
      if (result.status === 200) {
        onSuccess();
        return;
      }
      setError(errorBodyMessage(result.body) ?? 'Failed to revoke token');
    },
    onError: () => {
      setError('Failed to revoke token');
    },
  });

  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  const handleDelete = () => {
    if (!token) return;
    setError(null);
    revokeMutation.mutate({ params: { tokenId: token.id } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke Token</DialogTitle>
          <DialogDescription>
            Are you sure you want to revoke{' '}
            <strong>{token?.name ?? 'this token'}</strong>? Any applications using
            this token will stop working immediately.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={revokeMutation.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={revokeMutation.isPending}>
            {revokeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Revoking...
              </>
            ) : (
              'Revoke Token'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
