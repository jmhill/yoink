import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@yoink/ui-base/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@yoink/ui-base/components/dropdown-menu';
import { cn } from '@yoink/ui-base/lib/utils';
import { MoreHorizontal } from 'lucide-react';
type NamedListRailOverflowProps = {
  surface: 'desktop' | 'mobile-tasks';
  listId: string;
  label: string;
  onDelete: () => void;
};

const MENU_WIDTH = 128;
const MENU_GAP = 4;

/**
 * Named-list ⋯ overflow. Desktop keeps the kit DropdownMenu. Mobile cannot:
 * Vaul's overlay is on the HTML top layer, so a body-portaled menu stacks
 * under the sheet (reads as “does nothing”). Portal Delete into the drawer
 * and place it from the trigger box.
 */
export function NamedListRailOverflow({
  surface,
  listId,
  label,
  onDelete,
}: NamedListRailOverflowProps) {
  if (surface === 'desktop') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-rail-overflow={label}
            data-rail-overflow-list-id={listId}
            aria-label={`More for ${label}`}
            className="mr-1 shrink-0 text-muted-foreground hover:text-foreground"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="right"
          sideOffset={4}
          data-rail-overflow-menu={label}
        >
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              window.setTimeout(() => {
                onDelete();
              }, 0);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return <MobileNamedListOverflow listId={listId} label={label} onDelete={onDelete} />;
}

function MobileNamedListOverflow({
  listId,
  label,
  onDelete,
}: Omit<NamedListRailOverflowProps, 'surface'>) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const close = () => {
    setOpen(false);
    setCoords(null);
  };

  const openMenu = () => {
    const triggerBox = triggerRef.current?.getBoundingClientRect();
    const drawer = document.querySelector<HTMLElement>('[data-mobile-tasks-rail-drawer]');
    if (!triggerBox || !drawer) {
      return;
    }
    const drawerBox = drawer.getBoundingClientRect();
    const left = Math.min(
      triggerBox.right - drawerBox.left + MENU_GAP,
      Math.max(8, drawerBox.width - MENU_WIDTH - 8)
    );
    const below = triggerBox.bottom - drawerBox.top + MENU_GAP;
    const above = triggerBox.top - drawerBox.top - MENU_GAP - 36;
    const top = below + 36 <= drawerBox.height - 8 ? below : Math.max(8, above);
    setCoords({ top, left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const drawer =
    typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('[data-mobile-tasks-rail-drawer]')
      : null;

  return (
    <>
      <div ref={triggerRef} className="mr-1 inline-flex shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-rail-overflow={label}
          data-rail-overflow-list-id={listId}
          aria-label={`More for ${label}`}
          aria-haspopup="menu"
          aria-expanded={open}
          className="text-muted-foreground hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (open) {
              close();
              return;
            }
            openMenu();
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
      {open && coords && drawer
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              data-slot="dropdown-menu-content"
              data-rail-overflow-menu={label}
              className="bg-popover text-popover-foreground min-w-[8rem] rounded-md border p-1 shadow-md"
              style={{
                position: 'absolute',
                top: coords.top,
                left: coords.left,
                zIndex: 50,
                width: MENU_WIDTH,
              }}
            >
              <button
                type="button"
                role="menuitem"
                className={cn(
                  'relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm',
                  'text-destructive outline-hidden select-none'
                )}
                onClick={() => {
                  close();
                  window.setTimeout(() => {
                    onDelete();
                  }, 0);
                }}
              >
                Delete
              </button>
            </div>,
            drawer
          )
        : null}
    </>
  );
}
