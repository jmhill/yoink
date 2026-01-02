import { Link } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Settings } from 'lucide-react';
import { OrganizationSwitcher } from '@/components/organization-switcher';

type HeaderProps = {
  viewName?: string;
};

export function Header({ viewName }: HeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Link to="/" title="Yoink">
          <img src="/icon-192x192.png" alt="Yoink" className="h-10 w-10 rounded-lg" />
        </Link>
        <OrganizationSwitcher />
        {viewName && (
          <span className="text-lg font-medium text-foreground">{viewName}</span>
        )}
      </div>
      <Button variant="ghost" size="icon" asChild title="Settings">
        <Link to="/settings">
          <Settings className="size-8" />
        </Link>
      </Button>
    </div>
  );
}
