import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { tsrAdmin } from '@/api/client';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    try {
      // Use direct query for session check (outside React context)
      const response = await tsrAdmin.getSession.query();
      if (response.status !== 200) {
        throw redirect({ to: '/login' });
      }
    } catch {
      throw redirect({ to: '/login' });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Outlet />
    </div>
  );
}
