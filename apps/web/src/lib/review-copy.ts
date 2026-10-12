import type { ReviewProject } from '@yoink/api-contracts';

export const dayLabel = (days: number): string => (days === 1 ? '1 day' : `${days} days`);

export const formatReviewMonthDay = (date: string, timeZone?: string): string => {
  const instant = date.includes('T') ? new Date(date) : new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(instant);
};

export const formatLastChangeLine = (item: ReviewProject, timeZone: string): string =>
  `Last change ${formatReviewMonthDay(item.lastChangeAt, timeZone)} · ${dayLabel(item.daysSinceChange)}`;

export const formatWaitingRowCopy = (item: ReviewProject, today: string): string => {
  if (item.project.waitingSince === null) {
    return 'Waiting';
  }
  if (item.project.waitingSince === today) {
    return 'Since today';
  }
  const days = item.daysWaiting ?? 0;
  return `Since ${formatReviewMonthDay(item.project.waitingSince)} · ${dayLabel(days)}`;
};

export const reviewSubcopy = (total: number): string => {
  if (total === 1) {
    return '1 needs attention';
  }
  return `${total} need attention`;
};
