import type { MouseEvent } from 'react';
import { splitContentLinks } from '@/lib/linkify-content';

type CaptureContentProps = {
  content: string;
};

const stopRowActions = (event: MouseEvent<HTMLAnchorElement>) => {
  event.stopPropagation();
};

export function CaptureContent({ content }: CaptureContentProps) {
  const segments = splitContentLinks(content);

  return (
    <p className="whitespace-pre-wrap break-words">
      {segments.map((segment, index) =>
        segment.type === 'link' ? (
          <a
            key={`${segment.href}-${index}`}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-blue-500 underline hover:text-blue-600"
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
