import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { tokenStorage } from '@/lib/token';
import { AppNav } from '@/components/bottom-nav';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    if (!tokenStorage.isConfigured()) {
      throw redirect({ to: '/config' });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pl-48">
      <Outlet />
      <AppNav />
    </div>
  );
}
