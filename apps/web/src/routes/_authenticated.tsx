import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { tokenStorage } from '@/lib/token';
import { BottomNav } from '@/components/bottom-nav';

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
    <div className="min-h-screen bg-background pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}
