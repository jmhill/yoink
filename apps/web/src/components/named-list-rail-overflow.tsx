import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@yoink/ui-base/components/button';
import { cn } from '@yoink/ui-base/lib/utils';
import { MoreHorizontal } from 'lucide-react';
import {
  NAMED_LIST_OVERFLOW_MENU_WIDTH,
  namedListOverflowMenuCoords,
} from '@/lib/named-list-overflow-menu';

type NamedListRailOverflowProps = {
  surface: 'desktop' | 'mobile-tasks';
  listId: string;
  label: string;
  onDelete: () => void;
};

/**
 * Named-list ⋯ overflow. Kit DropdownMenu cannot sit above the chrome
 * on either surface: Vaul’s overlay is the HTML top layer on phone, and
 * the always-visible desktop rail is a z-50 overflow clip that hides or
 * swallows a same-layer portaled menu. Portal Delete above that chrome
 * and place it from the trigger box.
 */
export function NamedListRailOverflow({
  surface,
  listId,
  label,
  onDelete,
}: NamedListRailOverflowProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const close = () => {
    setOpen(false);
    setCoords(null);
  };

  const portalTarget = (): HTMLElement | null => {
    if (typeof document === 'undefined') {
      return null;
    }
    if (surface === 'mobile-tasks') {
      return document.querySelector<HTMLElement>('[data-mobile-tasks-rail-drawer]');
    }
    return document.body;
  };

  const openMenu = () => {
    const triggerBox = triggerRef.current?.getBoundingClientRect();
    if (!triggerBox) {
      return;
    }
    if (surface === 'mobile-tasks') {
      const drawer = document.querySelector<HTMLElement>('[data-mobile-tasks-rail-drawer]');
      if (!drawer) {
        return;
      }
      setCoords(
        namedListOverflowMenuCoords({
          trigger: triggerBox,
          container: drawer.getBoundingClientRect(),
        })
      );
    } else {
      setCoords(
        namedListOverflowMenuCoords({
          trigger: triggerBox,
          container: {
            top: 0,
            left: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
            width: window.innerWidth,
            height: window.innerHeight,
          },
        })
      );
    }
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

  const target = portalTarget();

  return (
    <>
      <div ref={triggerRef} className="mr-1 mt-1 inline-flex shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-rail-overflow={label}
          data-rail-overflow-list-id={listId}
          data-rail-overflow-surface={surface}
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
      {open && coords && target
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              data-slot="dropdown-menu-content"
              data-rail-overflow-menu={label}
              data-rail-overflow-menu-surface={surface}
              className="bg-popover text-popover-foreground min-w-[8rem] rounded-md border p-1 shadow-md"
              style={{
                position: surface === 'desktop' ? 'fixed' : 'absolute',
                top: coords.top,
                left: coords.left,
                zIndex: surface === 'desktop' ? 100 : 50,
                width: NAMED_LIST_OVERFLOW_MENU_WIDTH,
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
            target
          )
        : null}
    </>
  );
}
