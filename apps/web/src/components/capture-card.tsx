import { useState } from 'react';
import { CardContent } from '@yoink/ui-base/components/card';
import { Button, buttonVariants } from '@yoink/ui-base/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@yoink/ui-base/components/dropdown-menu';
import { Trash2, Link as LinkIcon, Clock, ArrowRight } from 'lucide-react';
import { SwipeableCard } from '@/components/swipeable-card';

export type SnoozeOption = 'later-today' | 'tomorrow' | 'next-week';
export type ExitDirection = 'left' | 'right';

export type CaptureCardProps = {
  capture: {
    id: string;
    content: string;
    sourceUrl?: string | null;
    capturedAt: string;
  };
  onTrash: (id: string, direction: ExitDirection) => void;
  onSnooze: (id: string, option: SnoozeOption, direction: ExitDirection) => void;
  onProcessToTask?: (capture: { id: string; content: string }) => void;
  isTrashing?: boolean;
  isSnoozeing?: boolean;
  isProcessing?: boolean;
  formatDate: (date: string) => string;
};

export function CaptureCard({
  capture,
  onTrash,
  onSnooze,
  onProcessToTask,
  isTrashing = false,
  isSnoozeing = false,
  isProcessing = false,
  formatDate,
}: CaptureCardProps) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  // Track if snooze was triggered by swipe (for exit direction)
  const [snoozeSwipeDirection, setSnoozeSwipeDirection] = useState<ExitDirection | null>(null);

  const handleSwipeSnooze = () => {
    // Open the snooze dropdown when swiping left
    setSnoozeSwipeDirection('left');
    setSnoozeOpen(true);
  };

  const handleSnoozeSelect = (option: SnoozeOption) => {
    // Use swipe direction if available, otherwise default to 'left' for button clicks
    onSnooze(capture.id, option, snoozeSwipeDirection ?? 'left');
    setSnoozeOpen(false);
    setSnoozeSwipeDirection(null);
  };

  const handleSnoozeOpenChange = (open: boolean) => {
    setSnoozeOpen(open);
    if (!open) {
      setSnoozeSwipeDirection(null);
    }
  };

  return (
    <SwipeableCard
      data-capture-id={capture.id}
      leftAction={{
        icon: <Clock className="h-5 w-5" />,
        label: 'Snooze',
        type: 'snooze',
        onAction: handleSwipeSnooze,
      }}
      rightAction={{
        icon: <Trash2 className="h-5 w-5" />,
        label: 'Trash',
        type: 'trash',
        onAction: () => onTrash(capture.id, 'right'),
      }}
      disabled={isTrashing || isSnoozeing}
    >
      <CardContent className="flex items-start justify-between gap-2 py-3">
        <div className="flex-1 min-w-0">
          <p className="whitespace-pre-wrap break-words">{capture.content}</p>
          {capture.sourceUrl && (
            <a
              href={capture.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 hover:underline"
              data-testid="source-url"
            >
              <LinkIcon className="h-3 w-3" />
              <span className="truncate">{capture.sourceUrl}</span>
            </a>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(capture.capturedAt)}
          </p>
        </div>
        <div className="flex gap-1">
          {onProcessToTask && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onProcessToTask(capture)}
              disabled={isProcessing}
              title="Convert to task"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          <DropdownMenu open={snoozeOpen} onOpenChange={handleSnoozeOpenChange}>
            <DropdownMenuTrigger
              disabled={isSnoozeing}
              aria-label="Snooze"
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <Clock className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => handleSnoozeSelect('later-today')}>
                Later today
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleSnoozeSelect('tomorrow')}>
                Tomorrow
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleSnoozeSelect('next-week')}>
                Next week
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onTrash(capture.id, 'right')}
            disabled={isTrashing}
            title="Trash"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </SwipeableCard>
  );
}
