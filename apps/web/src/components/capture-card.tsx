import { useEffect, useRef, useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Clock, Loader2, Trash2 } from 'lucide-react';
import { CaptureSnippet, CAPTURE_ACTION_CLASS, CAPTURE_SNIPPET_CARD_CLASS } from '@/components/capture-snippet';
import { SwipeableCard } from '@/components/swipeable-card';

export type SnoozeOption = 'later-today' | 'tomorrow' | 'next-week';
export type ExitDirection = 'left' | 'right';

const SNOOZE_OPTIONS: Array<{ option: SnoozeOption; label: string }> = [
  { option: 'later-today', label: 'Later today' },
  { option: 'tomorrow', label: 'Tomorrow' },
  { option: 'next-week', label: 'Next week' },
];

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
  const [snoozeSwipeDirection, setSnoozeSwipeDirection] = useState<ExitDirection | null>(null);
  const snoozeMenuRef = useRef<HTMLDivElement>(null);

  const handleSwipeSnooze = () => {
    setSnoozeSwipeDirection('left');
    setSnoozeOpen(true);
  };

  const closeSnoozeMenu = () => {
    setSnoozeOpen(false);
    setSnoozeSwipeDirection(null);
  };

  const handleSnoozeSelect = (option: SnoozeOption) => {
    onSnooze(capture.id, option, snoozeSwipeDirection ?? 'left');
    closeSnoozeMenu();
  };

  useEffect(() => {
    if (!snoozeOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (snoozeMenuRef.current?.contains(target)) {
        return;
      }
      closeSnoozeMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSnoozeMenu();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [snoozeOpen]);

  return (
    <div className="relative" ref={snoozeMenuRef}>
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
              <Button
                variant="ghost"
                className={CAPTURE_ACTION_CLASS}
                aria-label="Snooze"
                aria-expanded={snoozeOpen}
                aria-haspopup="menu"
                disabled={isSnoozing}
                onClick={() => setSnoozeOpen((open) => !open)}
              >
                Snooze
              </Button>
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
      {snoozeOpen ? (
        <div
          data-slot="dropdown-menu-content"
          role="menu"
          className="absolute right-3 top-full z-50 mt-1 min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {SNOOZE_OPTIONS.map(({ option, label }) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              data-slot="dropdown-menu-item"
              className="focus:bg-accent focus:text-accent-foreground w-full cursor-default rounded-sm px-2 py-1.5 text-left text-sm outline-hidden"
              onClick={() => handleSnoozeSelect(option)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
