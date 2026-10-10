import { useState, type FormEvent } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import { tsrProjects } from '@/api/client';
import { projectContract } from '@yoink/api-contracts';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';

type CreateProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: { id: string; name: string }) => void;
};

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateProjectDialogProps) {
  const queryClient = tsrProjects.useQueryClient();
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const trimmedName = name.trim();

  const createMutation = tsrProjects.create.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 201) return;
      toast.success('Project created');
      setName('');
      setObjective('');
      setFormError(null);
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      onCreated({ id: result.body.id, name: result.body.name });
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
        const status = err.status;
        if (status === 403 || status === 409) {
          const parsed = projectContract.create.responses[status].safeParse(err.body);
          if (parsed.success) {
            setFormError(parsed.data.message);
            return;
          }
        }
      }
      toast.error('Failed to create project');
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName('');
      setObjective('');
      setFormError(null);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmedName || createMutation.isPending) return;
    const trimmedObjective = objective.trim();
    createMutation.mutate({
      body: {
        name: trimmedName,
        ...(trimmedObjective ? { objective: trimmedObjective } : {}),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Give this project a name. An objective is optional.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              data-project-create-name=""
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormError(null);
              }}
              placeholder="Garden"
              maxLength={200}
              disabled={createMutation.isPending}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-objective">Objective</Label>
            <textarea
              id="project-objective"
              data-project-create-objective=""
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="What this project is for"
              maxLength={2000}
              disabled={createMutation.isPending}
              rows={3}
              className="border-input dark:bg-input/30 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
            {formError ? (
              <p role="alert" data-project-create-error className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-project-create-submit=""
              disabled={createMutation.isPending || !trimmedName}
            >
              {createMutation.isPending ? 'Creating...' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
