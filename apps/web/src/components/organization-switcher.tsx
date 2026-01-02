import { useState, useEffect } from 'react';
import { Check, ChevronDown, User, Building2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@yoink/ui-base/components/dropdown-menu';
import { Button } from '@yoink/ui-base/components/button';
import { getSession, switchOrganization, type SessionOrganization } from '@/api/auth';
import { cn } from '@yoink/ui-base/lib/utils';

type OrganizationSwitcherProps = {
  className?: string;
};

export function OrganizationSwitcher({ className }: OrganizationSwitcherProps) {
  const [organizations, setOrganizations] = useState<SessionOrganization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      const result = await getSession();
      if (result.ok) {
        setOrganizations(result.data.organizations);
        setCurrentOrgId(result.data.organizationId);
      }
      setIsLoading(false);
    };
    loadSession();
  }, []);

  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrgId || isSwitching) return;

    setIsSwitching(true);
    const result = await switchOrganization(orgId);

    if (result.ok) {
      // Reload the page to refresh all data with new org context
      window.location.reload();
    } else {
      // If switch failed, stop switching state
      setIsSwitching(false);
    }
  };

  // Still loading - show skeleton
  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 px-2 py-1', className)}>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const currentOrg = organizations.find((org) => org.id === currentOrgId);

  // Single organization - just show the name (not clickable)
  if (organizations.length <= 1) {
    return (
      <div className={cn('flex items-center gap-2 px-2 py-1 text-sm font-medium text-foreground', className)}>
        {currentOrg?.isPersonal ? (
          <User className="size-4 text-muted-foreground" />
        ) : (
          <Building2 className="size-4 text-muted-foreground" />
        )}
        <span className="max-w-[140px] truncate">
          {currentOrg?.name ?? 'Workspace'}
        </span>
      </div>
    );
  }

  // Multiple organizations - show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('gap-2', className)}
          disabled={isSwitching}
        >
          {currentOrg?.isPersonal ? (
            <User className="size-4 text-muted-foreground" />
          ) : (
            <Building2 className="size-4 text-muted-foreground" />
          )}
          <span className="max-w-[120px] truncate">
            {currentOrg?.name ?? 'Select org'}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch(org.id)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              {org.isPersonal ? (
                <User className="size-4 text-muted-foreground" />
              ) : (
                <Building2 className="size-4 text-muted-foreground" />
              )}
              <span className="truncate">{org.name}</span>
              {org.isPersonal && (
                <span className="text-xs text-muted-foreground">(Personal)</span>
              )}
            </div>
            {org.id === currentOrgId && (
              <Check className="size-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
