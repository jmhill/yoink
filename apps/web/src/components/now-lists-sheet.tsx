import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@yoink/ui-base/components/drawer';
import { Button } from '@yoink/ui-base/components/button';
import { namedPileSearch, unlistedPileSearch } from '@/lib/all-tasks-piles';
import { CreateNamedListDialog } from '@/components/create-named-list-dialog';

export type NowListRow = {
  id: string;
  name: string;
  openTaskCount: number;
};

type NowListsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: NowListRow[];
  unlistedCount: number;
};

export function NowListsSheet({
  open,
  onOpenChange,
  lists,
  unlistedCount,
}: NowListsSheetProps) {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  const goToPile = (search: { pile: string }) => {
    onOpenChange(false);
    void navigate({ to: '/tasks', search });
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent data-now-lists-sheet="" className="mx-auto max-w-lg">
          <DrawerHeader>
            <DrawerTitle>Lists</DrawerTitle>
            <DrawerDescription>Open a list to see its tasks</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            {lists.map((list) => (
              <Button
                key={list.id}
                type="button"
                variant="ghost"
                data-now-list={list.id}
                data-now-list-count={list.openTaskCount}
                className="h-auto justify-between py-3 font-normal"
                onClick={() => goToPile(namedPileSearch(list.id))}
              >
                <span>{list.name}</span>
                <span className="tabular-nums text-muted-foreground">{list.openTaskCount}</span>
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              data-now-list="unlisted"
              data-now-list-count={unlistedCount}
              className="h-auto justify-between py-3 font-normal"
              onClick={() => goToPile(unlistedPileSearch())}
            >
              <span>Unlisted</span>
              <span className="tabular-nums text-muted-foreground">{unlistedCount}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-2 border-dashed"
              onClick={() => setCreateOpen(true)}
            >
              + New list
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
      <CreateNamedListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(list) => {
          setCreateOpen(false);
          goToPile(namedPileSearch(list.id));
        }}
      />
    </>
  );
}
