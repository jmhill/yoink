import type { ReviewCounts, ReviewProject } from '@yoink/api-contracts';
import { compareKeyset } from '../../listing/domain/keyset-window.js';
import { reviewKeys, type ReviewCursorRow } from '../../listing/domain/list-keys.js';

export const REVIEW_SECTION_NEEDS_NEXT = '0';
export const REVIEW_SECTION_QUIET = '1';
export const REVIEW_SECTION_WAITING = '2';
export const WAITING_SINCE_ABSENT = '9999-12-31';

export type RankedReviewProject = ReviewProject & ReviewCursorRow;

export const waitingGroupKey = (waitingOn: string | null): string =>
  (waitingOn ?? '').trim().toLowerCase();

export const reviewSectionRank = (item: ReviewProject): string => {
  if (item.project.status === 'active' && item.reasons.includes('noNextAction')) {
    return REVIEW_SECTION_NEEDS_NEXT;
  }
  if (item.reasons.includes('quiet')) {
    return REVIEW_SECTION_QUIET;
  }
  return REVIEW_SECTION_WAITING;
};

const oldestWaitingSince = (dates: readonly (string | null)[]): string =>
  dates.reduce<string | null>((oldest, value) => {
    if (value === null) {
      return oldest;
    }
    if (oldest === null || value < oldest) {
      return value;
    }
    return oldest;
  }, null) ?? WAITING_SINCE_ABSENT;

export const waitingGroupOldestSince = (
  items: readonly ReviewProject[],
  groupKey: string
): string =>
  oldestWaitingSince(
    items
      .filter((item) => waitingGroupKey(item.project.waitingOn) === groupKey)
      .map((item) => item.project.waitingSince)
  );

export const rankReviewProject = (
  item: ReviewProject,
  waitingItems: readonly ReviewProject[]
): RankedReviewProject => {
  const sectionRank = reviewSectionRank(item);
  if (sectionRank !== REVIEW_SECTION_WAITING) {
    return {
      ...item,
      sectionRank,
      groupOldestSince: '0',
      groupName: '',
      rowWaitingSince: '0',
    };
  }
  const groupName = waitingGroupKey(item.project.waitingOn);
  return {
    ...item,
    sectionRank,
    groupOldestSince: waitingGroupOldestSince(waitingItems, groupName),
    groupName,
    rowWaitingSince: item.project.waitingSince ?? WAITING_SINCE_ABSENT,
  };
};

export const compareReview = (
  left: RankedReviewProject,
  right: RankedReviewProject
): number => compareKeyset(reviewKeys(left), reviewKeys(right));

export const countReviewReasons = (items: readonly ReviewProject[]): ReviewCounts => ({
  noNextAction: items.filter((item) => item.reasons.includes('noNextAction')).length,
  quiet: items.filter((item) => item.reasons.includes('quiet')).length,
  waiting: items.filter((item) => item.reasons.includes('waiting')).length,
});
