import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppNav } from '@/components/bottom-nav';
import { getSession } from '@/api/auth';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // Check if we have a valid session
    const sessionResult = await getSession();
    if (sessionResult.ok) {
      return; // Session auth - let request proceed
    }

    // Not authenticated - redirect to login with return URL
    const searchParams = location.pathname !== '/' ? { returnTo: location.pathname } : undefined;
    throw redirect({ to: '/login', search: searchParams });
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
