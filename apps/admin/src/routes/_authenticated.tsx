import { createFileRoute, Outlet, redirect, isRedirect } from '@tanstack/react-router';
import { tsrAdmin } from '@/api/client';
import { useTheme, type Theme } from '@/lib/use-theme';
import { Button } from '@yoink/ui-base/components/button';
import { Sun, Moon, Monitor } from 'lucide-react';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    try {
      // Use direct query for session check (outside React context)
      const response = await tsrAdmin.getSession.query();
      if (response.status !== 200) {
        throw redirect({ to: '/login' });
      }
    } catch (error) {
      // Don't catch redirect errors - let them propagate
      if (isRedirect(error)) {
        throw error;
      }
      // Network or other errors - redirect to login
      throw redirect({ to: '/login' });
    }
  },
  component: AuthenticatedLayout,
});

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  
  const cycleTheme = () => {
    const order: Theme[] = ['light', 'dark', 'system'];
    const currentIndex = order.indexOf(theme);
    const nextIndex = (currentIndex + 1) % order.length;
    setTheme(order[nextIndex]);
  };

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      title={`Theme: ${theme}`}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );
}

function AuthenticatedLayout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <Outlet />
    </div>
  );
}
