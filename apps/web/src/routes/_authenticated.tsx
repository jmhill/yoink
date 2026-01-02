import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppNav } from '@/components/bottom-nav';
import { getSession } from '@/api/auth';
import { tokenStorage } from '@/lib/token';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // Check if we have a valid session (passkey auth)
    const sessionResult = await getSession();
    if (sessionResult.ok) {
      return; // Session auth - let request proceed
    }

    // Backwards compatibility: Check if we have a token (legacy auth)
    // This allows existing token-authenticated users to continue using the app
    // while they migrate to passkeys. Remove this check once all users have
    // registered passkeys. See docs/PLAN.md Phase 7.7c for removal criteria.
    if (tokenStorage.isConfigured()) {
      return; // Token auth - let request proceed
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
