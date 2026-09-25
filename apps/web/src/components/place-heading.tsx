import type { ReactNode } from 'react';

type PlaceHeadingProps = {
  title: string;
  subcopy: string;
  subcopyTestId: string;
  action?: ReactNode;
};

/**
 * Inbox-grade you-are-here chrome: view/list name as the primary
 * heading plus a short muted cue. Same type and tokens on capture
 * and task screens — not a second visual system.
 */
export function PlaceHeading({
  title,
  subcopy,
  subcopyTestId,
  action,
}: PlaceHeadingProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1
          data-place-heading=""
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          {title}
        </h1>
        <p data-testid={subcopyTestId} className="mt-1 text-muted-foreground">
          {subcopy}
        </p>
      </div>
      {action}
    </div>
  );
}
