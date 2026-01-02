import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/join/$code')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/signup',
      search: { code: params.code },
    });
  },
});
