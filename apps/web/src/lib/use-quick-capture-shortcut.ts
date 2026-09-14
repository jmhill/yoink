import { useEffect, useRef } from 'react';
import {
  isQuickCaptureShortcut,
  shouldRouteQuickCaptureShortcut,
} from './quick-capture-shortcut';

type UseQuickCaptureShortcutOptions = {
  enabled: boolean;
  onTrigger: () => void;
};

/**
 * Desktop global ⌘K / Ctrl+K. Always swallows the chord so Chrome’s
 * omnibox search does not steal it; only routes when the user is not
 * typing in another field or dialog.
 */
export function useQuickCaptureShortcut({
  enabled,
  onTrigger,
}: UseQuickCaptureShortcutOptions): void {
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isQuickCaptureShortcut(event)) {
        return;
      }
      event.preventDefault();
      if (
        shouldRouteQuickCaptureShortcut({
          isDesktop: true,
          target: event.target,
        })
      ) {
        onTriggerRef.current();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled]);
}
