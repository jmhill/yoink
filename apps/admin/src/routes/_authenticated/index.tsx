import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/')({
  component: OrganizationsPage,
});

function OrganizationsPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold">Organizations</h1>
      <p className="text-gray-600">Organization list will go here.</p>
    </div>
  );
}
