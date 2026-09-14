import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@yoink/ui-base/components/button';
import { Clock, Loader2, Trash2 } from 'lucide-react';
import { CaptureSnippet, CAPTURE_ACTION_CLASS, CAPTURE_SNIPPET_CARD_CLASS } from '@/components/capture-snippet';
import { SwipeableCard } from '@/components/swipeable-card';
import {
  CAPTURE_SNOOZE_MENU_WIDTH,
  captureSnoozeMenuCoords,
} from '@/lib/capture-snooze-menu';

export type SnoozeOption = 'later-today' | 'tomorrow' | 'next-week';
export type ExitDirection = 'left' | 'right';

const SNOOZE_OPTIONS: Array<{ option: SnoozeOption; label: string }> = [
  { option: 'later-today', label: 'Later today' },
  { option: 'tomorrow', label: 'Tomorrow' },
  { option: 'next-week', label: 'Next week' },
];

const viewportBox = () => ({
  top: 0,
  left: 0,
  right: window.innerWidth,
  bottom: window.innerHeight,
  width: window.innerWidth,
  height: window.innerHeight,
});

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
  const [snoozeCoords, setSnoozeCoords] = useState<{ top: number; left: number } | null>(null);
  const snoozeTriggerRef = useRef<HTMLDivElement>(null);
  const snoozeMenuRef = useRef<HTMLDivElement>(null);

  const closeSnoozeMenu = () => {
    setSnoozeOpen(false);
    setSnoozeSwipeDirection(null);
    setSnoozeCoords(null);
  };

  const openSnoozeMenu = () => {
    const trigger = snoozeTriggerRef.current?.getBoundingClientRect();
    setSnoozeCoords(
      trigger
        ? captureSnoozeMenuCoords({ trigger, viewport: viewportBox() })
        : { top: 8, left: 8 }
    );
    setSnoozeOpen(true);
  };

  const handleSwipeSnooze = () => {
    setSnoozeSwipeDirection('left');
    openSnoozeMenu();
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
      if (snoozeTriggerRef.current?.contains(target) || snoozeMenuRef.current?.contains(target)) {
        return;
      }
      closeSnoozeMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSnoozeMenu();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [snoozeOpen]);

  return (
    <div className="relative">
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
              <div ref={snoozeTriggerRef} className="inline-flex">
                <Button
                  variant="ghost"
                  className={CAPTURE_ACTION_CLASS}
                  aria-label="Snooze"
                  aria-expanded={snoozeOpen}
                  aria-haspopup="menu"
                  disabled={isSnoozing}
                  onClick={() => {
                    if (snoozeOpen) {
                      closeSnoozeMenu();
                      return;
                    }
                    openSnoozeMenu();
                  }}
                >
                  Snooze
                </Button>
              </div>
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
      {snoozeOpen && snoozeCoords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={snoozeMenuRef}
              data-slot="dropdown-menu-content"
              role="menu"
              className="rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              style={{
                position: 'fixed',
                top: snoozeCoords.top,
                left: snoozeCoords.left,
                zIndex: 100,
                width: CAPTURE_SNOOZE_MENU_WIDTH,
              }}
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
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
