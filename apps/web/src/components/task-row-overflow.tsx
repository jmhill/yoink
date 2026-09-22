import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@yoink/ui-base/components/button';
import { cn } from '@yoink/ui-base/lib/utils';
import { MoreHorizontal } from 'lucide-react';
import {
  TASK_ROW_OVERFLOW_MENU_WIDTH,
  taskRowOverflowMenuCoords,
} from '@/lib/task-row-overflow-menu';

type TaskRowOverflowProps = {
  taskId: string;
  taskTitle: string;
  onEdit?: () => void;
  onDelete: () => void;
  disabled?: boolean;
};

const viewportBox = () => ({
  top: 0,
  left: 0,
  right: window.innerWidth,
  bottom: window.innerHeight,
  width: window.innerWidth,
  height: window.innerHeight,
});

/**
 * Task-row ⋯ overflow. Edit and Delete live here so one-pile rows can
 * keep a grip on the right without a pencil/trash cluster. Portal to
 * document.body with position:fixed — the swipe card’s overflow box
 * parks a kit DropdownMenu off-screen.
 */
export function TaskRowOverflow({
  taskId,
  taskTitle,
  onEdit,
  onDelete,
  disabled = false,
}: TaskRowOverflowProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const close = () => {
    setOpen(false);
    setCoords(null);
  };

  const openMenu = () => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    setCoords(
      trigger
        ? taskRowOverflowMenuCoords({ trigger, viewport: viewportBox() })
        : { top: 8, left: 8 }
    );
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

  const choose = (action: () => void) => {
    close();
    window.setTimeout(action, 0);
  };

  return (
    <>
      <div ref={triggerRef} className="inline-flex shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-slot="task-overflow"
          aria-label={`More actions for task "${taskTitle}"`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          className="size-11 min-h-11 min-w-11 shrink-0 text-muted-foreground hover:text-foreground [&_svg]:translate-y-[calc((var(--task-title-lh)-2.75rem)/2)]"
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
          <MoreHorizontal className="size-5" />
        </Button>
      </div>
      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              data-slot="dropdown-menu-content"
              data-task-overflow-menu={taskId}
              className="bg-popover text-popover-foreground min-w-[8rem] rounded-md border p-1 shadow-md"
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                zIndex: 100,
                width: TASK_ROW_OVERFLOW_MENU_WIDTH,
              }}
            >
              {onEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  data-slot="task-edit"
                  className={cn(
                    'relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm',
                    'outline-hidden select-none focus:bg-accent focus:text-accent-foreground'
                  )}
                  onClick={() => choose(onEdit)}
                >
                  Edit
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                data-slot="task-delete"
                className={cn(
                  'relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm',
                  'text-destructive outline-hidden select-none'
                )}
                onClick={() => choose(onDelete)}
              >
                Delete
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
