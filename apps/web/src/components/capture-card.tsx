import { useState } from 'react';
import { CardContent } from '@yoink/ui-base/components/card';
import { Button, buttonVariants } from '@yoink/ui-base/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@yoink/ui-base/components/dropdown-menu';
import { Archive, Link as LinkIcon, Pin, Clock } from 'lucide-react';
import { SwipeableCard } from '@/components/swipeable-card';

export type SnoozeOption = 'later-today' | 'tomorrow' | 'next-week';

export type CaptureCardProps = {
  capture: {
    id: string;
    content: string;
    sourceUrl?: string | null;
    capturedAt: string;
    pinnedAt?: string | null;
  };
  onArchive: (id: string) => void;
  onPin: (id: string, isPinned: boolean) => void;
  onSnooze: (id: string, option: SnoozeOption) => void;
  isArchiving?: boolean;
  isPinning?: boolean;
  isSnoozeing?: boolean;
  formatDate: (date: string) => string;
};

export function CaptureCard({
  capture,
  onArchive,
  onPin,
  onSnooze,
  isArchiving = false,
  isPinning = false,
  isSnoozeing = false,
  formatDate,
}: CaptureCardProps) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const isPinned = Boolean(capture.pinnedAt);

  const handleSwipeSnooze = () => {
    // Open the snooze dropdown when swiping left
    setSnoozeOpen(true);
  };

  const handleSnoozeSelect = (option: SnoozeOption) => {
    onSnooze(capture.id, option);
    setSnoozeOpen(false);
  };

  return (
    <SwipeableCard
      data-capture-id={capture.id}
      className={isPinned ? 'border-l-4 border-l-primary' : ''}
      leftAction={{
        icon: <Clock className="h-5 w-5" />,
        label: 'Snooze',
        type: 'snooze',
        onAction: handleSwipeSnooze,
      }}
      rightAction={{
        icon: <Archive className="h-5 w-5" />,
        label: 'Archive',
        type: 'archive',
        onAction: () => onArchive(capture.id),
      }}
      disabled={isArchiving || isSnoozeing}
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
          <DropdownMenu open={snoozeOpen} onOpenChange={setSnoozeOpen}>
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
            onClick={() => onPin(capture.id, isPinned)}
            disabled={isPinning}
            aria-label={isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin className={`h-4 w-4 ${isPinned ? 'fill-current' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onArchive(capture.id)}
            disabled={isArchiving}
            title="Archive"
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </SwipeableCard>
  );
}
