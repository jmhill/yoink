import { Button } from '@yoink/ui-base/components/button';
import { CardContent } from '@yoink/ui-base/components/card';
import {
  Circle,
  CircleCheck,
  Pin,
  PinOff,
  Trash2,
  Calendar,
  User,
  List,
  GripVertical,
} from 'lucide-react';
import { SwipeableCard } from '@/components/swipeable-card';
import type { Task } from '@yoink/api-contracts';
import type { SortablePileDragHandle } from '@/components/sortable-pile-list';

type TaskCardProps = {
  task: Task;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (task: Task) => void;
  isLoading?: boolean;
  assigneeLabel?: string;
  listLabel?: string;
  dragHandle?: SortablePileDragHandle;
};

export function TaskCard({
  task,
  onComplete,
  onUncomplete,
  onPin,
  onUnpin,
  onDelete,
  onEdit,
  isLoading = false,
  assigneeLabel,
  listLabel,
  dragHandle,
}: TaskCardProps) {
  const isCompleted = Boolean(task.completedAt);
  const isPinned = Boolean(task.pinnedAt);

  const handleCompleteToggle = () => {
    if (isCompleted) {
      onUncomplete(task.id);
    } else {
      onComplete(task.id);
    }
  };

  const handlePinClick = () => {
    if (isPinned) {
      onUnpin(task.id);
    } else {
      onPin(task.id);
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
          Matches capture swipe-right. Vertical stays scroll; desktop mouse is tap-only. */}
      <SwipeableCard
      data-task-id={task.id}
      rightAction={{
        icon: isCompleted ? (
          <Circle className="h-5 w-5" />
        ) : (
          <CircleCheck className="h-5 w-5" />
        ),
        label: isCompleted ? 'Incomplete' : 'Complete',
        type: 'complete',
        onAction: handleCompleteToggle,
      }}
      disabled={isLoading}
    >
      <CardContent className="flex items-start gap-3 py-3 text-base leading-6 [--task-title-lh:1lh]">
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
          disabled={isLoading}
          onClick={handleCompleteToggle}
          className="size-11 min-h-11 min-w-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground [&_svg]:translate-y-[calc((var(--task-title-lh)-2.75rem)/2)]"
        >
          {isCompleted ? (
            <CircleCheck className="size-7 text-primary" />
          ) : (
            <Circle className="size-7" />
          )}
        </Button>
        
        <button
          type="button"
          onClick={() => onEdit?.(task)}
          className="flex-1 min-w-0 text-left hover:bg-muted/50 -mx-2 px-2 rounded transition-colors cursor-pointer"
          disabled={isLoading}
        >
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
        </button>

        <div className="flex shrink-0 items-start gap-1">
          {dragHandle && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-drag-handle=""
              aria-label={`Drag to reorder ${task.title}`}
              disabled={isLoading}
              className="size-11 min-h-11 min-w-11 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing [&_svg]:translate-y-[calc((var(--task-title-lh)-2.75rem)/2)]"
              onPointerDown={(event) => {
                if (isLoading) {
                  return;
                }
                dragHandle.onPointerDown(event);
              }}
              onPointerMove={dragHandle.onPointerMove}
              onPointerUp={dragHandle.onPointerUp}
              onPointerCancel={dragHandle.onPointerUp}
              onTouchStart={(event) => {
                if (isLoading) {
                  return;
                }
                dragHandle.onTouchStart(event);
              }}
              onTouchMove={dragHandle.onTouchMove}
              onTouchEnd={dragHandle.onTouchEnd}
              onTouchCancel={dragHandle.onTouchEnd}
            >
              <GripVertical className="size-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handlePinClick}
            disabled={isLoading}
            title={isPinned ? 'Unpin' : 'Pin'}
            aria-label={isPinned ? `Unpin task "${task.title}"` : `Pin task "${task.title}"`}
            className={`[&_svg]:translate-y-[calc((var(--task-title-lh)-2rem)/2)]${
              isPinned ? ' text-primary' : ''
            }`}
          >
            {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(task.id)}
            disabled={isLoading}
            title="Delete"
            aria-label={`Delete task "${task.title}"`}
            className="text-muted-foreground hover:text-destructive [&_svg]:translate-y-[calc((var(--task-title-lh)-2rem)/2)]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
      </SwipeableCard>
    </div>
  );
}
