import type { MouseEvent, ReactNode } from 'react';
import { Globe, Keyboard, Share2, Smartphone } from 'lucide-react';
import { CaptureContent } from '@/components/capture-content';
import {
  CAPTURE_SNIPPET_TEST_ID,
  CAPTURE_SOURCE_LINE_TEST_ID,
  captureSourceKind,
  captureSourceLine,
} from '@/lib/capture-snippet';

export const CAPTURE_SNIPPET_CARD_CLASS = 'gap-0 py-0';

/** Mobile ~44px hit targets; desktop can go denser. */
export const CAPTURE_ACTION_CLASS =
  '!h-11 min-h-11 min-w-11 shrink-0 !px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground md:!h-8 md:min-h-8 md:min-w-0';

const stopRowActions = (event: MouseEvent<HTMLAnchorElement>) => {
  event.stopPropagation();
};

const SOURCE_ICON = {
  chrome: Globe,
  android: Smartphone,
  typed: Keyboard,
  share: Share2,
  unknown: Globe,
} as const;

type CaptureSnippetProps = {
  content: string;
  sourceUrl?: string | null;
  sourceApp?: string | null;
  capturedAt: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function CaptureSnippet({
  content,
  sourceUrl,
  sourceApp,
  capturedAt,
  meta,
  actions,
}: CaptureSnippetProps) {
  const sourceLine = captureSourceLine({ sourceApp, capturedAt });
  const SourceIcon = SOURCE_ICON[captureSourceKind(sourceApp)];

  return (
    <div
      data-testid={CAPTURE_SNIPPET_TEST_ID}
      className="flex flex-col gap-1 px-3 py-2.5"
    >
      <CaptureContent content={content} />
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-xs text-primary underline-offset-2 hover:underline"
          data-testid="source-url"
          onClick={stopRowActions}
        >
          {sourceUrl}
        </a>
      ) : null}
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <SourceIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span data-testid={CAPTURE_SOURCE_LINE_TEST_ID} className="min-w-0">
            {sourceLine}
          </span>
          {meta}
        </p>
        {actions ? <div className="ml-auto flex items-center gap-0.5">{actions}</div> : null}
      </div>
    </div>
  );
}
