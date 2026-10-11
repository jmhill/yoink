import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@yoink/ui-base/components/button';
import { Card } from '@yoink/ui-base/components/card';
import { CaptureSnippet, CAPTURE_SNIPPET_CARD_CLASS } from '@/components/capture-snippet';
import type { SnoozeOption } from '@/components/capture-card';
import {
  CAPTURE_SNOOZE_MENU_WIDTH,
  captureSnoozeMenuCoords,
} from '@/lib/capture-snooze-menu';
import { captureUrlDomain } from '@/lib/process-prefill';
import { PROCESS_KEY_HINTS } from '@/lib/process-keys';
import { useDesktopLayout } from '@/lib/use-desktop-layout';

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

type ProcessCapture = {
  id: string;
  content: string;
  sourceUrl?: string | null;
  sourceApp?: string | null;
  capturedAt: string;
};

type ProcessItemProps = {
  capture: ProcessCapture;
  onMakeTask: (capture: { id: string; content: string }) => void;
  onNewProject: (capture: ProcessCapture) => void;
  onSomedayProject: (capture: ProcessCapture) => void;
  onSnooze: (id: string, option: SnoozeOption) => void;
  onTrash: (id: string) => void;
  snoozeOpen: boolean;
  onSnoozeOpenChange: (open: boolean) => void;
  disabled?: boolean;
};

const KeyHint = ({
  action,
  show,
}: {
  action: keyof typeof PROCESS_KEY_HINTS;
  show: boolean;
}) => {
  if (!show) {
    return null;
  }
  return (
    <kbd
      data-process-key-hint={PROCESS_KEY_HINTS[action]}
      className="ml-1 rounded border border-border px-1 text-[10px] font-normal text-muted-foreground"
    >
      {PROCESS_KEY_HINTS[action]}
    </kbd>
  );
};

export function ProcessItem({
  capture,
  onMakeTask,
  onNewProject,
  onSomedayProject,
  onSnooze,
  onTrash,
  snoozeOpen,
  onSnoozeOpenChange,
  disabled = false,
}: ProcessItemProps) {
  const [snoozeCoords, setSnoozeCoords] = useState<{ top: number; left: number } | null>(null);
  const snoozeTriggerRef = useRef<HTMLDivElement>(null);
  const snoozeMenuRef = useRef<HTMLDivElement>(null);
  const showHints = useDesktopLayout();
  const domain = capture.sourceUrl ? captureUrlDomain(capture.sourceUrl) : undefined;

  const closeSnoozeMenu = () => {
    onSnoozeOpenChange(false);
    setSnoozeCoords(null);
  };

  const openSnoozeMenu = () => {
    const trigger = snoozeTriggerRef.current?.getBoundingClientRect();
    setSnoozeCoords(
      trigger
        ? captureSnoozeMenuCoords({ trigger, viewport: viewportBox() })
        : { top: 8, left: 8 }
    );
    onSnoozeOpenChange(true);
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
    <Card
      data-capture-id={capture.id}
      data-process-item-kind="capture"
      className={CAPTURE_SNIPPET_CARD_CLASS}
    >
      <CaptureSnippet
        content={capture.content}
        sourceUrl={capture.sourceUrl}
        sourceUrlLabel={domain}
        sourceApp={capture.sourceApp}
        capturedAt={capture.capturedAt}
      />
      <div className="flex flex-wrap gap-2 px-3 pb-3">
        <Button
          type="button"
          variant="outline"
          data-process-make-task=""
          disabled={disabled}
          onClick={() => onMakeTask({ id: capture.id, content: capture.content })}
        >
          Make it a task
          <KeyHint action="make-task" show={showHints} />
        </Button>
        <Button
          type="button"
          variant="outline"
          data-process-new-project=""
          disabled={disabled}
          onClick={() => onNewProject(capture)}
        >
          New project
          <KeyHint action="new-project" show={showHints} />
        </Button>
        <Button
          type="button"
          variant="outline"
          data-process-someday-project=""
          disabled={disabled}
          onClick={() => onSomedayProject(capture)}
        >
          Someday project
          <KeyHint action="someday-project" show={showHints} />
        </Button>
        <div ref={snoozeTriggerRef} className="inline-flex">
          <Button
            type="button"
            variant="outline"
            data-process-snooze=""
            disabled={disabled}
            aria-expanded={snoozeOpen}
            aria-haspopup="menu"
            onClick={() => {
              if (snoozeOpen) {
                closeSnoozeMenu();
                return;
              }
              openSnoozeMenu();
            }}
          >
            Snooze
            <KeyHint action="snooze" show={showHints} />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          data-process-trash=""
          disabled={disabled}
          onClick={() => onTrash(capture.id)}
        >
          Trash
          <KeyHint action="trash" show={showHints} />
        </Button>
      </div>
      {snoozeOpen && snoozeCoords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={snoozeMenuRef}
              data-slot="dropdown-menu-content"
              data-process-snooze-menu=""
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
                  data-process-snooze-option={option}
                  className="focus:bg-accent focus:text-accent-foreground w-full cursor-default rounded-sm px-2 py-1.5 text-left text-sm outline-hidden"
                  onClick={() => {
                    onSnooze(capture.id, option);
                    closeSnoozeMenu();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </Card>
  );
}
