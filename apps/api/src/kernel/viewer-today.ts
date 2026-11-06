export const DEFAULT_VIEWER_TIME_ZONE = 'America/Chicago';

export type ViewerTodayInput = {
  readonly now: Date;
  readonly timeZone: string;
};

/**
 * Calendar date the viewer is in, as YYYY-MM-DD.
 * Pure: only `now` and an IANA `timeZone`. Never reads the system clock.
 */
export const viewerToday = (input: ViewerTodayInput): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: input.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(input.now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
};

export const resolveViewerToday = (input: {
  readonly now: Date;
  readonly timeZone?: string;
}): string =>
  viewerToday({
    now: input.now,
    timeZone: input.timeZone ?? DEFAULT_VIEWER_TIME_ZONE,
  });
