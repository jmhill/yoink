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

export function AppNav() {
  const matchRoute = useMatchRoute();

  const isActive = (item: NavItem) => {
    return item.matchPaths.some((path) => matchRoute({ to: path }));
  };

  return (
    <>
      {/* Mobile: Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background safe-area-bottom md:hidden">
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

      {/* Desktop: Left sidebar */}
      <nav className="fixed left-0 top-0 z-50 hidden h-full w-48 flex-col border-r bg-background p-4 md:flex">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">Yoink</h1>
        </div>
        <div className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
