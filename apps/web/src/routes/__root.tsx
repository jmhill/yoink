import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Toaster } from '@yoink/ui-base/components/sonner';
import { useNetworkStatus } from '@/lib/use-network-status';
import { usePwaUpdate } from '@/lib/use-pwa-update';
import { UpdateBanner } from '@/components/update-banner';
import { WifiOff } from 'lucide-react';

function RootLayout() {
  const isOnline = useNetworkStatus();
  const { needRefresh, refresh, dismiss } = usePwaUpdate();

  return (
    <>
      {needRefresh && <UpdateBanner onRefresh={refresh} onDismiss={dismiss} />}
      {!isOnline && (
        <div className="bg-yellow-100 text-yellow-800 text-center py-2 text-sm flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span>You're offline. Some features may not work.</span>
        </div>
      )}
      <Outlet />
      <Toaster />
    </>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
