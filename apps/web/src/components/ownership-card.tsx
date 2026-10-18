import { useState, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { Button } from '@yoink/ui-base/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@yoink/ui-base/components/sheet';
import { AlertCircle, Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ErrorSchema,
  TransferOwnershipResponseSchema,
} from '@yoink/api-contracts';
import { memberDisplayName, type Member } from '@/api/auth';
import { tsrOrganizations } from '@/api/client';
import { useDesktopLayout } from '@/lib/use-desktop-layout';

type OwnershipCardProps = {
  organizationId: string;
  isPersonal: boolean;
  currentUserId: string;
  members: Member[];
  onTransferred: () => void;
};

const handoverCandidates = (members: Member[], ownerUserId: string): Member[] =>
  members.filter((member) => member.kind === 'human' && member.userId !== ownerUserId);

const confirmCopy = (name: string): string =>
  `Make ${name} the owner? You'll become an admin.`;

export function OwnershipCard({
  organizationId,
  isPersonal,
  currentUserId,
  members,
  onTransferred,
}: OwnershipCardProps) {
  const owner = members.find((member) => member.role === 'owner');
  const canHandOver =
    owner !== undefined && owner.userId === currentUserId && !isPersonal;
  if (!canHandOver || owner === undefined) {
    return null;
  }

  return (
    <OwnershipCardOpen
      organizationId={organizationId}
      owner={owner}
      candidates={handoverCandidates(members, owner.userId)}
      onTransferred={onTransferred}
    />
  );
}

type OwnershipCardOpenProps = {
  organizationId: string;
  owner: Member;
  candidates: Member[];
  onTransferred: () => void;
};

function OwnershipCardOpen({
  organizationId,
  owner,
  candidates,
  onTransferred,
}: OwnershipCardOpenProps) {
  const isDesktop = useDesktopLayout();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = tsrOrganizations.transferOwner.useMutation({
    onSuccess: (result) => {
      if (result.status === 200) {
        const parsed = TransferOwnershipResponseSchema.safeParse(result.body);
        if (parsed.success) {
          toast.success(`${memberDisplayName(parsed.data.owner)} is now the owner.`);
          setOpen(false);
          setSelected(null);
          setError(null);
          onTransferred();
          return;
        }
      }
      const parsed = ErrorSchema.safeParse(result.body);
      setError(parsed.success ? parsed.data.message : 'Could not hand over ownership.');
    },
    onError: () => {
      setError('Could not hand over ownership.');
    },
  });

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSelected(null);
      setError(null);
    }
  };

  const body = selected ? (
    <ConfirmStep
      name={memberDisplayName(selected)}
      error={error}
      pending={mutation.isPending}
      onBack={() => {
        setSelected(null);
        setError(null);
      }}
      onConfirm={() => {
        setError(null);
        mutation.mutate({
          params: { organizationId },
          body: { userId: selected.userId },
        });
      }}
    />
  ) : (
    <PickerStep
      candidates={candidates}
      onPick={(member) => {
        setSelected(member);
        setError(null);
      }}
    />
  );

  return (
    <>
      <Card id="ownership" data-ownership-card="">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Ownership
          </CardTitle>
          <CardDescription>This workspace has one owner.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Owner: <span className="font-medium">{memberDisplayName(owner)}</span>
          </p>
          <Button
            data-hand-over-ownership=""
            onClick={() => setOpen(true)}
          >
            Hand over ownership
          </Button>
        </CardContent>
      </Card>

      {isDesktop ? (
        <Dialog open={open} onOpenChange={close}>
          <DialogContent data-ownership-overlay="">
            {body}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={close}>
          <SheetContent data-ownership-overlay="" side="bottom" className="gap-0">
            {body}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

type PickerStepProps = {
  candidates: Member[];
  onPick: (member: Member) => void;
};

function PickerStep({ candidates, onPick }: PickerStepProps) {
  const title = 'Hand over ownership';
  const description = 'Pick the person who should own this workspace.';
  return (
    <div data-ownership-picker="">
      <OverlayHeader title={title} description={description} />
      <div className="space-y-2 py-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one else in this workspace can take ownership yet.
          </p>
        ) : (
          candidates.map((member) => (
            <Button
              key={member.userId}
              variant="outline"
              className="w-full justify-start"
              data-ownership-candidate={memberDisplayName(member)}
              onClick={() => onPick(member)}
            >
              {memberDisplayName(member)}
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

type ConfirmStepProps = {
  name: string;
  error: string | null;
  pending: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

function ConfirmStep({ name, error, pending, onBack, onConfirm }: ConfirmStepProps) {
  return (
    <div data-ownership-confirm="">
      <OverlayHeader title="Hand over ownership" description={confirmCopy(name)} />
      {error ? (
        <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      <OverlayFooter>
        <Button variant="outline" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button data-confirm-handover="" onClick={onConfirm} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Handing over...
            </>
          ) : (
            'Hand over'
          )}
        </Button>
      </OverlayFooter>
    </div>
  );
}

function OverlayHeader({ title, description }: { title: string; description: string }) {
  const isDesktop = useDesktopLayout();
  if (isDesktop) {
    return (
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
    );
  }
  return (
    <SheetHeader>
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription>{description}</SheetDescription>
    </SheetHeader>
  );
}

function OverlayFooter({ children }: { children: ReactNode }) {
  const isDesktop = useDesktopLayout();
  if (isDesktop) {
    return <DialogFooter>{children}</DialogFooter>;
  }
  return <SheetFooter>{children}</SheetFooter>;
}
