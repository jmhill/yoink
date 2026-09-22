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
import { TaskRowOverflow } from '@/components/task-row-overflow';
import type { Task } from '@yoink/api-contracts';
import type { SortablePileDragHandle } from '@/components/sortable-pile-list';

type TaskCardProps = {
  task: Task;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
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
  onDelete,
  onEdit,
  isLoading = false,
  assigneeLabel,
  listLabel,
  dragHandle,
}: TaskCardProps) {
  const isCompleted = Boolean(task.completedAt);

  const handleCompleteToggle = () => {
    if (isCompleted) {
      onUncomplete(task.id);
    } else {
      onComplete(task.id);
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
          <TaskRowOverflow
            taskId={task.id}
            taskTitle={task.title}
            onEdit={onEdit ? () => onEdit(task) : undefined}
            onDelete={() => onDelete(task.id)}
            disabled={isLoading}
          />
        </div>
      </CardContent>
      </SwipeableCard>
    </div>
  );
}
