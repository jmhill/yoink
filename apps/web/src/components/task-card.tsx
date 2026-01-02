import { Button } from '@yoink/ui-base/components/button';
import { CardContent } from '@yoink/ui-base/components/card';
import { Checkbox } from '@yoink/ui-base/components/checkbox';
import { Pin, PinOff, Trash2, Calendar } from 'lucide-react';
import { SwipeableCard } from '@/components/swipeable-card';
import type { Task } from '@yoink/api-contracts';

type TaskCardProps = {
  task: Task;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (task: Task) => void;
  isLoading?: boolean;
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
}: TaskCardProps) {
  const isCompleted = Boolean(task.completedAt);
  const isPinned = Boolean(task.pinnedAt);

  const handleCheckboxChange = () => {
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
    <SwipeableCard
      data-task-id={task.id}
      rightAction={{
        icon: <Trash2 className="h-5 w-5" />,
        label: 'Delete',
        type: 'trash',
        onAction: () => onDelete(task.id),
      }}
      disabled={isLoading}
    >
      <CardContent className="flex items-start gap-3 py-3">
        <Checkbox
          checked={isCompleted}
          onCheckedChange={handleCheckboxChange}
          disabled={isLoading}
          className="mt-0.5"
          aria-label={isCompleted ? `Mark task "${task.title}" as incomplete` : `Mark task "${task.title}" as complete`}
        />
        
        <button
          type="button"
          onClick={() => onEdit?.(task)}
          className="flex-1 min-w-0 text-left hover:bg-muted/50 -mx-2 px-2 py-1 -my-1 rounded transition-colors cursor-pointer"
          disabled={isLoading}
        >
          <p className={`break-words ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
            {task.title}
          </p>
          
          {task.dueDate && (
            <div className={`mt-1 flex items-center gap-1 text-xs ${
              isCompleted
                ? 'text-muted-foreground'
                : getDueDateColorClass(task.dueDate)
            }`}>
              <Calendar className="h-3 w-3" />
              <span>{formatDueDate(task.dueDate)}</span>
            </div>
          )}
        </button>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handlePinClick}
            disabled={isLoading}
            title={isPinned ? 'Unpin' : 'Pin'}
            aria-label={isPinned ? `Unpin task "${task.title}"` : `Pin task "${task.title}"`}
            className={isPinned ? 'text-primary' : ''}
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
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </SwipeableCard>
  );
}
