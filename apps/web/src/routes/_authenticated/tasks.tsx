import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { CheckSquare } from 'lucide-react';
import { Header } from '@/components/header';

export const Route = createFileRoute('/_authenticated/tasks')({
  component: TasksPage,
});

function TasksPage() {
  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header viewName="Tasks" />

      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <CheckSquare className="mx-auto mb-2 h-8 w-8" />
          <p>Tasks view coming soon</p>
          <p className="text-sm">Process captures into tasks to see them here</p>
        </CardContent>
      </Card>
    </div>
  );
}
