import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/lists')({
  beforeLoad: () => {
    throw redirect({
      to: '/tasks',
      search: { filter: 'today' },
    });
  },
});
