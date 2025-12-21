import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { tsrPublic, tsrAdmin } from './api/client';
import './index.css';

const queryClient = new QueryClient();

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Page Not Found</h1>
        <p className="text-muted-foreground mb-4">The requested page does not exist.</p>
        <a href="/admin/login" className="text-primary hover:underline">Go to Login</a>
      </div>
    </div>
  );
}

const router = createRouter({
  routeTree,
  basepath: '/admin',
  context: {
    queryClient,
  },
  defaultNotFoundComponent: NotFound,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <tsrPublic.ReactQueryProvider>
        <tsrAdmin.ReactQueryProvider>
          <RouterProvider router={router} />
        </tsrAdmin.ReactQueryProvider>
      </tsrPublic.ReactQueryProvider>
    </QueryClientProvider>
  </StrictMode>
);
