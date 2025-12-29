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
import { Key, Plus, Trash2, Loader2, AlertCircle, Smartphone, Monitor, Cloud } from 'lucide-react';
import type { PasskeyCredentialInfo } from '@yoink/api-contracts';
import {
  listPasskeys,
  registerPasskey,
  deletePasskey,
  suggestDeviceName,
} from '@/api/passkey';

type PasskeyListState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; credentials: PasskeyCredentialInfo[] };

export function SecuritySection() {
  const [listState, setListState] = useState<PasskeyListState>({ status: 'loading' });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState<PasskeyCredentialInfo | null>(null);

  const loadPasskeys = async () => {
    setListState({ status: 'loading' });
    const result = await listPasskeys();
    if (result.ok) {
      setListState({ status: 'success', credentials: result.data.credentials });
    } else {
      setListState({ status: 'error', error: result.error });
    }
  };

  useEffect(() => {
    loadPasskeys();
  }, []);

  const handleAddSuccess = () => {
    setAddDialogOpen(false);
    loadPasskeys();
  };

  const handleDeleteClick = (credential: PasskeyCredentialInfo) => {
    setCredentialToDelete(credential);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSuccess = () => {
    setDeleteDialogOpen(false);
    setCredentialToDelete(null);
    loadPasskeys();
  };

  const canDelete =
    listState.status === 'success' && listState.credentials.length > 1;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>Manage your passkeys for secure authentication</CardDescription>
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
                {listState.credentials.map((credential) => (
                  <PasskeyItem
                    key={credential.id}
                    credential={credential}
                    canDelete={canDelete}
                    onDelete={() => handleDeleteClick(credential)}
                  />
                ))}
                {listState.credentials.length === 0 && (
                  <p className="text-muted-foreground text-sm py-2">
                    No passkeys registered. Add one to enable passwordless login.
                  </p>
                )}
              </div>
              <Button onClick={() => setAddDialogOpen(true)} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Passkey
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <AddPasskeyDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />

      <DeletePasskeyDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        credential={credentialToDelete}
        onSuccess={handleDeleteSuccess}
      />
    </>
  );
}

type PasskeyItemProps = {
  credential: PasskeyCredentialInfo;
  canDelete: boolean;
  onDelete: () => void;
};

function PasskeyItem({ credential, canDelete, onDelete }: PasskeyItemProps) {
  const createdDate = new Date(credential.createdAt).toLocaleDateString();
  const lastUsedDate = credential.lastUsedAt
    ? new Date(credential.lastUsedAt).toLocaleDateString()
    : 'Never';

  const DeviceIcon = credential.deviceType === 'multiDevice' ? Cloud : 
    credential.name?.toLowerCase().includes('iphone') || 
    credential.name?.toLowerCase().includes('android') ? Smartphone : Monitor;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-muted">
          <DeviceIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-sm">{credential.name || 'Unnamed passkey'}</p>
          <p className="text-xs text-muted-foreground">
            Created {createdDate} · Last used {lastUsedDate}
          </p>
          {credential.backedUp && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Cloud className="h-3 w-3" /> Synced
            </p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={!canDelete}
        title={canDelete ? 'Delete passkey' : 'Cannot delete your only passkey'}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  );
}

type AddPasskeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

function AddPasskeyDialog({ open, onOpenChange, onSuccess }: AddPasskeyDialogProps) {
  const [deviceName, setDeviceName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setDeviceName(suggestDeviceName());
      setError(null);
    }
  }, [open]);

  const handleRegister = async () => {
    setIsRegistering(true);
    setError(null);

    const result = await registerPasskey(deviceName.trim() || undefined);

    setIsRegistering(false);

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
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Add Passkey
          </DialogTitle>
          <DialogDescription>
            Register a new passkey for secure, passwordless authentication.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g., MacBook Pro"
              disabled={isRegistering}
            />
            <p className="text-xs text-muted-foreground">
              A friendly name to identify this passkey.
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRegistering}>
            Cancel
          </Button>
          <Button onClick={handleRegister} disabled={isRegistering}>
            {isRegistering ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Registering...
              </>
            ) : (
              'Register Passkey'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DeletePasskeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: PasskeyCredentialInfo | null;
  onSuccess: () => void;
};

function DeletePasskeyDialog({
  open,
  onOpenChange,
  credential,
  onSuccess,
}: DeletePasskeyDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset error when dialog opens
  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  const handleDelete = async () => {
    if (!credential) return;

    setIsDeleting(true);
    setError(null);

    const result = await deletePasskey(credential.id);

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
          <DialogTitle>Delete Passkey</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{' '}
            <strong>{credential?.name || 'this passkey'}</strong>? This action cannot be undone.
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
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
