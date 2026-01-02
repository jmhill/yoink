import { useState, useEffect } from 'react';
import { Check, ChevronDown, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@yoink/ui-base/components/dropdown-menu';
import { Button } from '@yoink/ui-base/components/button';
import { getSession, switchOrganization, type SessionOrganization } from '@/api/auth';

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

  // Don't render if user only has one organization
  if (isLoading || organizations.length <= 1) {
    return null;
  }

  const currentOrg = organizations.find((org) => org.id === currentOrgId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={className}
          disabled={isSwitching}
        >
          <span className="max-w-[120px] truncate">
            {currentOrg?.name ?? 'Select org'}
          </span>
          <ChevronDown className="ml-1 size-4" />
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
              {org.isPersonal && <User className="size-4 text-muted-foreground" />}
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
