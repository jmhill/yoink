import { useState, useEffect } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import { Building2, LogOut, Loader2, AlertCircle, User, Crown, Shield, Users } from 'lucide-react';
import { getSession, leaveOrganization, switchOrganization, type SessionOrganization } from '@/api/auth';

type OrgsListState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; organizations: SessionOrganization[]; currentOrgId: string };

export function OrganizationsSection() {
  const [listState, setListState] = useState<OrgsListState>({ status: 'loading' });
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [orgToLeave, setOrgToLeave] = useState<SessionOrganization | null>(null);

  const loadOrganizations = async () => {
    setListState({ status: 'loading' });
    const result = await getSession();
    if (result.ok) {
      setListState({
        status: 'success',
        organizations: result.data.organizations,
        currentOrgId: result.data.organizationId,
      });
    } else {
      setListState({ status: 'error', error: result.error });
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  const handleLeaveClick = (org: SessionOrganization) => {
    setOrgToLeave(org);
    setLeaveDialogOpen(true);
  };

  const handleLeaveSuccess = async () => {
    setLeaveDialogOpen(false);

    // If we left the current org, switch to personal org first
    if (listState.status === 'success' && orgToLeave?.id === listState.currentOrgId) {
      const personalOrg = listState.organizations.find((org) => org.isPersonal);
      if (personalOrg) {
        await switchOrganization(personalOrg.id);
      }
    }

    // Reload the page to refresh all data
    window.location.reload();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organizations
          </CardTitle>
          <CardDescription>Manage your organization memberships</CardDescription>
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
            <div className="space-y-2">
              {listState.organizations.map((org) => (
                <OrganizationItem
                  key={org.id}
                  organization={org}
                  isCurrent={org.id === listState.currentOrgId}
                  onLeave={() => handleLeaveClick(org)}
                />
              ))}
              {listState.organizations.length === 0 && (
                <p className="text-muted-foreground text-sm py-2">
                  No organizations found.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <LeaveOrganizationDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        organization={orgToLeave}
        onSuccess={handleLeaveSuccess}
      />
    </>
  );
}

type OrganizationItemProps = {
  organization: SessionOrganization;
  isCurrent: boolean;
  onLeave: () => void;
};

function OrganizationItem({ organization, isCurrent, onLeave }: OrganizationItemProps) {
  const RoleIcon = organization.role === 'owner' ? Crown :
    organization.role === 'admin' ? Shield : Users;

  const roleLabel = organization.role.charAt(0).toUpperCase() + organization.role.slice(1);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-muted">
          {organization.isPersonal ? (
            <User className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">{organization.name}</p>
            {isCurrent && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                Current
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {organization.isPersonal && (
              <span className="text-xs px-1.5 py-0.5 rounded border text-muted-foreground">
                Personal
              </span>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <RoleIcon className="h-3 w-3" />
              {roleLabel}
            </span>
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onLeave}
        disabled={organization.isPersonal}
        title={organization.isPersonal ? 'Cannot leave personal organization' : 'Leave organization'}
      >
        <LogOut className="h-4 w-4 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  );
}

type LeaveOrganizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: SessionOrganization | null;
  onSuccess: () => void;
};

function LeaveOrganizationDialog({
  open,
  onOpenChange,
  organization,
  onSuccess,
}: LeaveOrganizationDialogProps) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset error when dialog opens
  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  const handleLeave = async () => {
    if (!organization) return;

    setIsLeaving(true);
    setError(null);

    const result = await leaveOrganization(organization.id);

    setIsLeaving(false);

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
          <DialogTitle>Leave Organization</DialogTitle>
          <DialogDescription>
            Are you sure you want to leave{' '}
            <strong>{organization?.name}</strong>? You will lose access to all
            data in this organization.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLeaving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleLeave} disabled={isLeaving}>
            {isLeaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Leaving...
              </>
            ) : (
              'Leave Organization'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
