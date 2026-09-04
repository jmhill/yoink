import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/lists_/$listId')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/tasks',
      search: { pile: params.listId },
    });
  },
});
