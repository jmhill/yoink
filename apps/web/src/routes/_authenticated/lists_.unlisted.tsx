import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/lists_/unlisted')({
  beforeLoad: () => {
    throw redirect({
      to: '/tasks',
      search: { pile: 'unlisted' },
    });
  },
});
