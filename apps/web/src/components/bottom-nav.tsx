import { Link, useMatchRoute } from '@tanstack/react-router';
import { Inbox, CheckSquare } from 'lucide-react';
import { cn } from '@yoink/ui-base/lib/utils';

type NavItem = {
  to: string;
  label: string;
  icon: typeof Inbox;
  matchPaths: string[];
};

const navItems: NavItem[] = [
  {
    to: '/',
    label: 'Inbox',
    icon: Inbox,
    // Match inbox-related routes
    matchPaths: ['/', '/snoozed', '/trash'],
  },
  {
    to: '/tasks',
    label: 'Tasks',
    icon: CheckSquare,
    matchPaths: ['/tasks'],
  },
];

export function BottomNav() {
  const matchRoute = useMatchRoute();

  const isActive = (item: NavItem) => {
    return item.matchPaths.some((path) => matchRoute({ to: path }));
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background safe-area-bottom">
      <div className="container mx-auto max-w-2xl">
        <div className="flex justify-around">
          {navItems.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-6 w-6" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
