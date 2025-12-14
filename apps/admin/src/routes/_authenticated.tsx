import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { adminApi } from '@/api/client';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    try {
      const response = await adminApi.getSession();
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
