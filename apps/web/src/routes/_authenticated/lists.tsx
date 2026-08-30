import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { tsrLists } from '@/api/client';
import { List } from 'lucide-react';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';

export const Route = createFileRoute('/_authenticated/lists')({
  component: ListsPage,
});

function ListsPage() {
  const { data, isPending, error, refetch } = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: {},
  });

  const lists = data?.status === 200 ? data.body.lists : [];

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header viewName="Lists" />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : lists.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <List className="mx-auto mb-2 h-8 w-8" />
            <p>No named lists yet</p>
            <p className="text-sm">This organization has no named lists.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {lists.map((list) => (
            <li key={list.id}>
              <Card data-list-id={list.id} data-list-name={list.name}>
                <CardContent className="py-4">
                  <p className="font-medium">{list.name}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
