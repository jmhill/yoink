import { createFileRoute, Outlet, redirect, isRedirect } from '@tanstack/react-router';
import { tsrAdmin } from '@/api/client';
import { useTheme, type ThemeMode, type ColorTheme } from '@/lib/use-theme';
import { Button } from '@yoink/ui-base/components/button';
import { Sun, Moon, Monitor, Palette } from 'lucide-react';

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
  const { mode, setMode, colorTheme, setColorTheme } = useTheme();
  
  const cycleMode = () => {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const currentIndex = order.indexOf(mode);
    const nextIndex = (currentIndex + 1) % order.length;
    setMode(order[nextIndex]);
  };

  const cycleColorTheme = () => {
    const order: ColorTheme[] = ['default', 'tokyo-night'];
    const currentIndex = order.indexOf(colorTheme);
    const nextIndex = (currentIndex + 1) % order.length;
    setColorTheme(order[nextIndex]);
  };

  const ModeIcon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor;

  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={cycleMode}
        title={`Mode: ${mode}`}
      >
        <ModeIcon className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={cycleColorTheme}
        title={`Theme: ${colorTheme}`}
      >
        <Palette className="h-5 w-5" />
      </Button>
    </div>
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
