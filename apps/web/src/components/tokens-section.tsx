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
import { listTokens, createToken, revokeToken } from '@/api/tokens';

type TokenListState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; tokens: TokenInfo[] };

const MAX_TOKENS = 2;

export function TokensSection() {
  const [listState, setListState] = useState<TokenListState>({ status: 'loading' });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<TokenInfo | null>(null);

  const loadTokens = async () => {
    setListState({ status: 'loading' });
    const result = await listTokens();
    if (result.ok) {
      setListState({ status: 'success', tokens: result.data.tokens });
    } else {
      setListState({ status: 'error', error: result.error });
    }
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const handleCreateSuccess = () => {
    setCreateDialogOpen(false);
    loadTokens();
  };

  const handleDeleteClick = (token: TokenInfo) => {
    setTokenToDelete(token);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSuccess = () => {
    setDeleteDialogOpen(false);
    setTokenToDelete(null);
    loadTokens();
  };

  const canCreate =
    listState.status === 'success' && listState.tokens.length < MAX_TOKENS;

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
            Maximum {MAX_TOKENS} tokens per organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {listState.status === 'loading' && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {listState.status === 'error' && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {listState.error}
            </div>
          )}

          {listState.status === 'success' && (
            <>
              <div className="space-y-2">
                {listState.tokens.map((token) => (
                  <TokenItem
                    key={token.id}
                    token={token}
                    onDelete={() => handleDeleteClick(token)}
                  />
                ))}
                {listState.tokens.length === 0 && (
                  <p className="text-muted-foreground text-sm py-2">
                    No API tokens. Create one to use with the browser extension or CLI.
                  </p>
                )}
              </div>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="w-full"
                disabled={!canCreate}
                title={canCreate ? undefined : `Maximum ${MAX_TOKENS} tokens allowed`}
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

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-muted">
          <Key className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-sm">{token.name}</p>
          <p className="text-xs text-muted-foreground">
            Created {createdDate} · Last used {lastUsedDate}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        title="Revoke token"
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
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setTokenName('');
      setError(null);
      setRawToken(null);
      setCopied(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!tokenName.trim()) {
      setError('Token name is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    const result = await createToken(tokenName.trim());

    setIsCreating(false);

    if (result.ok) {
      setRawToken(result.data.rawToken);
    } else {
      setError(result.error);
    }
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

  // Show success state with raw token
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
            <Label htmlFor="token-name">Token Name</Label>
            <Input
              id="token-name"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="e.g., Browser Extension"
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              A friendly name to identify this token.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset error when dialog opens
  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  const handleDelete = async () => {
    if (!token) return;

    setIsDeleting(true);
    setError(null);

    const result = await revokeToken(token.id);

    setIsDeleting(false);

    if (result.ok) {
      onSuccess();
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke Token</DialogTitle>
          <DialogDescription>
            Are you sure you want to revoke{' '}
            <strong>{token?.name || 'this token'}</strong>? Any applications using
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? (
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
