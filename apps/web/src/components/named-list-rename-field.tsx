import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { httpFailureMessage, httpStatusOf, isNetworkFailure, listClient } from '@/api/client';
import { cancelLiveQueries, invalidateLiveQueries } from '@/lib/live-query';
import { toast } from 'sonner';

type NamedListRenameFieldProps = {
  listId: string;
  currentName: string;
  onCancel: () => void;
  onRenamed: (name: string) => void;
};

export function NamedListRenameField({
  listId,
  currentName,
  onCancel,
  onRenamed,
}: NamedListRenameFieldProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);
  const [formError, setFormError] = useState<string | null>(null);
  const trimmedName = name.trim();

  const renameMutation = useMutation({
    mutationFn: (input: Parameters<typeof listClient.rename>[0]) => listClient.rename(input),
    onMutate: async () => {
      await cancelLiveQueries(queryClient);
    },
    onSuccess: async (result) => {
      setFormError(null);
      await invalidateLiveQueries(queryClient);
      onRenamed(result.name);
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      const status = httpStatusOf(err);
      if (status === 409 || status === 400) {
        setFormError(
          httpFailureMessage(err) ??
            (status === 409 ? 'A list with this name already exists' : 'Name is required')
        );
        return;
      }
      toast.error('Failed to rename list');
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (formRef.current?.contains(target)) {
        return;
      }
      onCancel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onCancel]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmedName || renameMutation.isPending) {
      if (!trimmedName) {
        setFormError('Name is required');
      }
      return;
    }
    renameMutation.mutate({
      id: listId,
      name: trimmedName,
    });
  };

  return (
    <form
      ref={formRef}
      data-list-rename=""
      data-list-rename-list-id={listId}
      className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-1"
      onSubmit={handleSubmit}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Input
          ref={inputRef}
          data-list-rename-input=""
          aria-label={`Rename ${currentName}`}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setFormError(null);
          }}
          maxLength={200}
          enterKeyHint="done"
          disabled={renameMutation.isPending}
          className="h-8 min-w-0 flex-1 px-2 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          data-list-rename-done=""
          disabled={renameMutation.isPending || !trimmedName}
        >
          Done
        </Button>
      </div>
      {formError ? (
        <p role="alert" data-list-rename-error="" className="text-xs text-destructive">
          {formError}
        </p>
      ) : null}
    </form>
  );
}
