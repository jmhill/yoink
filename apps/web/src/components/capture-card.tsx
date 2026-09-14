import { useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@yoink/ui-base/components/dropdown-menu';
import { Clock, Loader2, Trash2 } from 'lucide-react';
import { CaptureSnippet, CAPTURE_ACTION_CLASS, CAPTURE_SNIPPET_CARD_CLASS } from '@/components/capture-snippet';
import { SwipeableCard } from '@/components/swipeable-card';

export type SnoozeOption = 'later-today' | 'tomorrow' | 'next-week';
export type ExitDirection = 'left' | 'right';

export type CaptureCardProps = {
  capture: {
    id: string;
    content: string;
    sourceUrl?: string | null;
    sourceApp?: string | null;
    capturedAt: string;
  };
  onTrash: (id: string, direction: ExitDirection) => void;
  onSnooze: (id: string, option: SnoozeOption, direction: ExitDirection) => void;
  onProcessToTask?: (capture: { id: string; content: string }) => void;
  isTrashing?: boolean;
  isSnoozing?: boolean;
  isProcessing?: boolean;
};

export function CaptureCard({
  capture,
  onTrash,
  onSnooze,
  onProcessToTask,
  isTrashing = false,
  isSnoozing = false,
  isProcessing = false,
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
      className={CAPTURE_SNIPPET_CARD_CLASS}
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
      disabled={isTrashing || isSnoozing}
    >
      <CaptureSnippet
        content={capture.content}
        sourceUrl={capture.sourceUrl}
        sourceApp={capture.sourceApp}
        capturedAt={capture.capturedAt}
        actions={
          <>
            {onProcessToTask && (
              <Button
                variant="ghost"
                className={CAPTURE_ACTION_CLASS}
                onClick={() => onProcessToTask(capture)}
                disabled={isProcessing}
                title="Promote"
                aria-label="Promote"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Promote'}
              </Button>
            )}
            <DropdownMenu open={snoozeOpen} onOpenChange={handleSnoozeOpenChange}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={CAPTURE_ACTION_CLASS}
                  aria-label="Snooze"
                  disabled={isSnoozing}
                >
                  Snooze
                </Button>
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
              className={CAPTURE_ACTION_CLASS}
              onClick={() => onTrash(capture.id, 'right')}
              disabled={isTrashing}
              title="Trash"
              aria-label="Trash"
            >
              Trash
            </Button>
          </>
        }
      />
    </SwipeableCard>
  );
}
