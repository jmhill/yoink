import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { CardContent } from '@yoink/ui-base/components/card';
import {
  Circle,
  CircleCheck,
  Calendar,
  User,
  List,
  GripVertical,
} from 'lucide-react';
import { SwipeableCard } from '@/components/swipeable-card';
import type { Task } from '@yoink/api-contracts';
import type { SortablePileDragHandle } from '@/components/sortable-pile-list';
import { cn } from '@yoink/ui-base/lib/utils';

const TAP_SLOP_PX = 10;

type TaskCardProps = {
  task: Task;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onEdit?: (task: Task) => void;
  isLoading?: boolean;
  assigneeLabel?: string;
  listLabel?: string;
  dragHandle?: SortablePileDragHandle;
  reorderMode?: boolean;
};

export function TaskCard({
  task,
  onComplete,
  onUncomplete,
  onEdit,
  isLoading = false,
  assigneeLabel,
  listLabel,
  dragHandle,
  reorderMode = false,
}: TaskCardProps) {
  const isCompleted = Boolean(task.completedAt);
  const completingEnabled = !isLoading && !reorderMode;
  const swipeStartedRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);

  const handleCompleteToggle = () => {
    if (!completingEnabled) {
      return;
    }
    if (isCompleted) {
      onUncomplete(task.id);
    } else {
      onComplete(task.id);
    }
  };

  const handleRowClick = () => {
    if (reorderMode || isLoading || !onEdit) {
      return;
    }
    if (swipeStartedRef.current) {
      swipeStartedRef.current = false;
      return;
    }
    if (pointerMovedRef.current) {
      return;
    }
    onEdit(task);
  };

  const handleRowPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    pointerMovedRef.current = false;
    if (reorderMode && dragHandle && !isLoading) {
      dragHandle.onPointerDown(event);
    }
  };

  const handleRowPointerMove = (event: ReactPointerEvent) => {
    if (pointerStartRef.current) {
      const dx = event.clientX - pointerStartRef.current.x;
      const dy = event.clientY - pointerStartRef.current.y;
      if (Math.hypot(dx, dy) > TAP_SLOP_PX) {
        pointerMovedRef.current = true;
      }
    }
    if (reorderMode && dragHandle) {
      dragHandle.onPointerMove(event);
    }
  };

  const getTodayStr = () => new Date().toISOString().split('T')[0];

  const formatDueDate = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate + 'T00:00:00'); // Parse as local date
    
    const todayStr = getTodayStr();
    const tomorrowDate = new Date(today);
    tomorrowDate.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    if (dueDate === todayStr) {
      return 'Today';
    } else if (dueDate === tomorrowStr) {
      return 'Tomorrow';
    } else {
      return due.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  };

  /**
   * Get the color class for a due date:
   * - Overdue (past): red (destructive)
   * - Today: orange (warning)
   * - Future: green (success)
   */
  const getDueDateColorClass = (dueDate: string): string => {
    const todayStr = getTodayStr();
    if (dueDate < todayStr) {
      // Overdue - red
      return 'text-destructive';
    } else if (dueDate === todayStr) {
      // Today - orange
      return 'text-orange-600 dark:text-orange-400';
    } else {
      // Future - green
      return 'text-green-600 dark:text-green-400';
    }
  };

  return (
    <div
      {...(dragHandle
        ? { 'data-open-task-id': task.id, 'data-open-task-title': task.title }
        : {})}
    >
      {/* Touch: swipe right completes (same toggle as the complete control).
          Matches capture swipe-right. Vertical stays scroll; desktop mouse is tap-only.
          A swipe must not also open Edit. Reorder mode turns swipe and complete off. */}
      <SwipeableCard
      data-task-id={task.id}
      rightAction={
        completingEnabled
          ? {
              icon: isCompleted ? (
                <Circle className="h-5 w-5" />
              ) : (
                <CircleCheck className="h-5 w-5" />
              ),
              label: isCompleted ? 'Incomplete' : 'Complete',
              type: 'complete',
              onAction: handleCompleteToggle,
            }
          : undefined
      }
      disabled={isLoading || reorderMode}
      onSwipeStart={() => {
        swipeStartedRef.current = true;
      }}
    >
      <CardContent
        className={cn(
          'flex items-start gap-3 py-3 text-base leading-6 [--task-title-lh:1lh]',
          reorderMode && 'cursor-grab touch-none active:cursor-grabbing'
        )}
        onClick={handleRowClick}
        onPointerDown={handleRowPointerDown}
        onPointerMove={handleRowPointerMove}
        onPointerUp={reorderMode && dragHandle ? dragHandle.onPointerUp : undefined}
        onPointerCancel={reorderMode && dragHandle ? dragHandle.onPointerUp : undefined}
        onTouchStart={reorderMode && dragHandle ? dragHandle.onTouchStart : undefined}
        onTouchMove={reorderMode && dragHandle ? dragHandle.onTouchMove : undefined}
        onTouchEnd={reorderMode && dragHandle ? dragHandle.onTouchEnd : undefined}
        onTouchCancel={reorderMode && dragHandle ? dragHandle.onTouchEnd : undefined}
      >
        {/* 44px hit target stays in flow; glyph shifts to the title's first line. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-slot="task-complete"
          aria-pressed={isCompleted}
          aria-label={
            isCompleted
              ? `Mark task "${task.title}" as incomplete`
              : `Mark task "${task.title}" as complete`
          }
          disabled={!completingEnabled}
          onPointerDown={(event) => {
            if (!reorderMode) {
              event.stopPropagation();
            }
          }}
          onClick={(event) => {
            event.stopPropagation();
            handleCompleteToggle();
          }}
          className="size-11 min-h-11 min-w-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground [&_svg]:translate-y-[calc((var(--task-title-lh)-2.75rem)/2)]"
        >
          {isCompleted ? (
            <CircleCheck className="size-7 text-primary" />
          ) : (
            <Circle className="size-7" />
          )}
        </Button>
        
        <div className="min-w-0 flex-1">
          <p
            data-slot="task-title"
            className={`break-words leading-6 ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
          >
            {task.title}
          </p>
          
          {(task.dueDate || assigneeLabel || listLabel) && (
            <div
              data-slot="task-meta"
              className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            >
              {task.dueDate && (
                <div className={`flex items-center gap-1 ${
                  isCompleted
                    ? 'text-muted-foreground'
                    : getDueDateColorClass(task.dueDate)
                }`}>
                  <Calendar className="h-3 w-3" />
                  <span>{formatDueDate(task.dueDate)}</span>
                </div>
              )}
              {assigneeLabel && (
                <div
                  className="flex items-center gap-1 text-muted-foreground"
                  data-assignee={assigneeLabel}
                >
                  <User className="h-3 w-3" />
                  <span>{assigneeLabel}</span>
                </div>
              )}
              {listLabel && (
                <div
                  className="flex items-center gap-1 text-muted-foreground"
                  data-list={listLabel}
                >
                  <List className="h-3 w-3" />
                  <span>{listLabel}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {reorderMode && dragHandle ? (
          <span
            data-drag-handle=""
            aria-hidden="true"
            className="flex size-11 min-h-11 min-w-11 shrink-0 items-start justify-center text-muted-foreground [&_svg]:translate-y-[calc((var(--task-title-lh)-2.75rem)/2)]"
          >
            <GripVertical className="size-5" />
          </span>
        ) : null}
      </CardContent>
      </SwipeableCard>
    </div>
  );
}
