import type { MouseEvent } from 'react';
import { splitContentLinks } from '@/lib/linkify-content';
import { CAPTURE_CONTENT_TEST_ID } from '@/lib/capture-snippet';

type CaptureContentProps = {
  content: string;
};

const stopRowActions = (event: MouseEvent<HTMLAnchorElement>) => {
  event.stopPropagation();
};

export function CaptureContent({ content }: CaptureContentProps) {
  const segments = splitContentLinks(content);

  return (
    <p
      data-testid={CAPTURE_CONTENT_TEST_ID}
      className="text-sm leading-snug whitespace-pre-wrap break-words text-foreground"
    >
      {segments.map((segment, index) =>
        segment.type === 'link' ? (
          <a
            key={`${segment.href}-${index}`}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary underline underline-offset-2 hover:text-primary/80"
            data-testid="capture-content-link"
            onClick={stopRowActions}
          >
            {segment.value}
          </a>
        ) : (
          <span key={`text-${index}`}>{segment.value}</span>
        )
      )}
    </p>
  );
}
