import type { Ref } from 'react';
import { Input } from '@yoink/ui-base/components/input';
import { cn } from '@yoink/ui-base/lib/utils';
import { useDesktopLayout } from '@/lib/use-desktop-layout';
import {
  QUICK_CAPTURE_HINT_TEST_ID,
  QUICK_CAPTURE_INPUT_TEST_ID,
  quickCaptureShortcutHintLabel,
} from '@/lib/quick-capture-shortcut';

type QuickCaptureFieldProps = {
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
};

/**
 * Inbox typed-capture field. Desktop shows a theme-token ⌘K / Ctrl+K
 * hint (costume cue). Mobile keeps the field with no shortcut chrome.
 */
export function QuickCaptureField({
  inputRef,
  value,
  onChange,
  placeholder,
  disabled,
}: QuickCaptureFieldProps) {
  const isDesktop = useDesktopLayout();
  const hint =
    typeof navigator === 'undefined'
      ? 'Ctrl+K'
      : quickCaptureShortcutHintLabel(navigator.platform);

  return (
    <div className="relative flex-1">
      <Input
        ref={inputRef}
        data-testid={QUICK_CAPTURE_INPUT_TEST_ID}
        data-quick-capture-input=""
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-keyshortcuts="Control+K Meta+K"
        className={cn(isDesktop && (hint === '⌘K' ? 'pr-12' : 'pr-[4.5rem]'))}
      />
      {isDesktop ? (
        <kbd
          data-testid={QUICK_CAPTURE_HINT_TEST_ID}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 inline-flex h-5 -translate-y-1/2 items-center rounded border border-border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground"
        >
          {hint}
        </kbd>
      ) : null}
    </div>
  );
}
