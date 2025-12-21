import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Toaster } from '@yoink/ui-base/components/sonner';

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
});
