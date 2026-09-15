import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, User, Building2 } from 'lucide-react';
import { Button } from '@yoink/ui-base/components/button';
import { getSession, switchOrganization, type SessionOrganization } from '@/api/auth';
import { cn } from '@yoink/ui-base/lib/utils';
import {
  ORG_SWITCHER_MENU_WIDTH,
  orgSwitcherMenuCoords,
} from '@/lib/org-switcher-menu';
import { toast } from 'sonner';

type OrganizationSwitcherProps = {
  className?: string;
};

const viewportBox = () => ({
  top: 0,
  left: 0,
  right: window.innerWidth,
  bottom: window.innerHeight,
  width: window.innerWidth,
  height: window.innerHeight,
});

export function OrganizationSwitcher({ className }: OrganizationSwitcherProps) {
  const [organizations, setOrganizations] = useState<SessionOrganization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const close = () => {
    setOpen(false);
    setCoords(null);
  };

  const openMenu = () => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    setCoords(
      trigger
        ? orgSwitcherMenuCoords({
            trigger,
            viewport: viewportBox(),
            itemCount: organizations.length,
          })
        : { top: 8, left: 8 }
    );
    setOpen(true);
  };

  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrgId || isSwitching) {
      close();
      return;
    }

    close();
    setIsSwitching(true);
    try {
      const result = await switchOrganization(orgId);
      if (result.ok) {
        window.location.reload();
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error('Network error. Please check your connection.');
    }
    setIsSwitching(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 px-2 py-1', className)}>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const currentOrg = organizations.find((org) => org.id === currentOrgId);

  if (organizations.length <= 1) {
    return (
      <div
        className={cn('flex items-center gap-2 px-2 py-1 text-sm font-medium text-foreground', className)}
        data-org-switcher-current={currentOrg?.name ?? 'Workspace'}
      >
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

  return (
    <>
      <div ref={triggerRef} className="inline-flex">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('gap-2', className)}
          disabled={isSwitching}
          data-org-switcher=""
          data-org-switcher-current={currentOrg?.name ?? 'Select org'}
          title="Switch organization"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            if (open) {
              close();
              return;
            }
            openMenu();
          }}
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
      </div>
      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              data-slot="dropdown-menu-content"
              data-org-switcher-menu=""
              className="bg-popover text-popover-foreground rounded-md border p-1 shadow-md"
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                zIndex: 100,
                width: ORG_SWITCHER_MENU_WIDTH,
              }}
            >
              {organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  role="menuitem"
                  data-org-switcher-item={org.id}
                  className={cn(
                    'focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none'
                  )}
                  onClick={() => {
                    void handleSwitch(org.id);
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {org.isPersonal ? (
                      <User className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Building2 className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{org.name}</span>
                    {org.isPersonal && (
                      <span className="shrink-0 text-xs text-muted-foreground">(Personal)</span>
                    )}
                  </div>
                  {org.id === currentOrgId && (
                    <Check className="size-4 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
