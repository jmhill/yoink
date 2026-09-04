import { Link, useMatchRoute } from '@tanstack/react-router';
import { cn } from '@yoink/ui-base/lib/utils';
import { CheckSquare, Inbox } from 'lucide-react';
import { AppRailPanel } from '@/components/app-rail-panel';

type MobileNavItem = {
  to: string;
  label: string;
  icon: typeof Inbox;
  matchPaths: string[];
};

const mobileNavItems: MobileNavItem[] = [
  {
    to: '/',
    label: 'Inbox',
    icon: Inbox,
    matchPaths: ['/', '/snoozed', '/trash'],
  },
  {
    to: '/tasks',
    label: 'Tasks',
    icon: CheckSquare,
    matchPaths: ['/tasks', '/lists', '/lists/$listId'],
  },
];

export function AppNav() {
  const matchRoute = useMatchRoute();

  const isMobileActive = (item: MobileNavItem) => {
    return item.matchPaths.some((path) => matchRoute({ to: path }));
  };

  return (
    <>
      {/* Mobile thumb bar stays Inbox | Tasks only — not the twelve rail destinations. */}
      <nav
        data-app-mobile-nav=""
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background safe-area-bottom md:hidden"
      >
        <div className="container mx-auto max-w-2xl">
          <div className="flex justify-around">
            {mobileNavItems.map((item) => {
              const active = isMobileActive(item);
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  data-mobile-nav-item={item.label}
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

      <AppRailPanel
        surface="desktop"
        showBrand
        className="fixed left-0 top-0 z-50 hidden h-full w-48 flex-col border-r bg-background p-4 md:flex"
      />
    </>
  );
}
