import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { tsr } from './api/client';
import { initSentry } from './instrument';
import { createAppQueryClient, installLiveQueryTestHook } from './lib/live-query';
import { installSafePointerCapture } from './lib/safe-pointer-capture';
import './index.css';

installSafePointerCapture();

const queryClient = createAppQueryClient();
installLiveQueryTestHook(queryClient);

const router = createRouter({
  routeTree,
  basepath: '/',
});

// Initialize Sentry with router for route-based tracing
initSentry(router);

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <tsr.ReactQueryProvider>
        <RouterProvider router={router} />
      </tsr.ReactQueryProvider>
    </QueryClientProvider>
  </StrictMode>
);
