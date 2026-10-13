import type { Project, ReviewNextAction, ReviewProject } from '@yoink/api-contracts';
import { viewerToday } from '../../shared/domain/viewer-today.js';
import { calendarDaysBetween } from './calendar-days.js';
import { reviewReasons } from './classify-review.js';
import {
  compareReview,
  countReviewReasons,
  rankReviewProject,
  type RankedReviewProject,
} from './review-order.js';

export type ReviewCandidate = {
  readonly project: Project;
  readonly lastChangeAt: string;
  readonly nextAction: ReviewNextAction | null;
};

export const lastChangeLocalDate = (input: {
  readonly lastChangeAt: string;
  readonly timeZone: string;
}): string =>
  viewerToday({
    now: new Date(input.lastChangeAt),
    timeZone: input.timeZone,
  });

export const toReviewProject = (
  candidate: ReviewCandidate,
  input: { readonly today: string; readonly timeZone: string }
): ReviewProject | null => {
  const daysSinceChange = Math.max(
    0,
    calendarDaysBetween(
      input.today,
      lastChangeLocalDate({ lastChangeAt: candidate.lastChangeAt, timeZone: input.timeZone })
    )
  );
  const daysWaiting =
    candidate.project.waitingSince === null
      ? null
      : Math.max(0, calendarDaysBetween(input.today, candidate.project.waitingSince));
  const reasons = reviewReasons({
    status: candidate.project.status,
    nextActionTaskId: candidate.project.nextActionTaskId,
    daysSinceChange,
  });
  if (reasons.length === 0) {
    return null;
  }
  return {
    project: candidate.project,
    reasons: [...reasons],
    lastChangeAt: candidate.lastChangeAt,
    daysSinceChange,
    daysWaiting,
    nextAction: candidate.nextAction,
  };
};

export const buildReviewItems = (
  candidates: readonly ReviewCandidate[],
  input: { readonly today: string; readonly timeZone: string }
): readonly RankedReviewProject[] => {
  const classified = candidates.flatMap((candidate) => {
    const item = toReviewProject(candidate, input);
    return item === null ? [] : [item];
  });
  const waitingItems = classified.filter((item) => item.reasons.includes('waiting'));
  return classified.reduce<RankedReviewProject[]>((ordered, item) => {
    const ranked = rankReviewProject(item, waitingItems);
    const index = ordered.findIndex((existing) => compareReview(ranked, existing) < 0);
    if (index === -1) {
      return [...ordered, ranked];
    }
    return [...ordered.slice(0, index), ranked, ...ordered.slice(index)];
  }, []);
};

export const reviewCountsFor = (
  items: readonly ReviewProject[]
): ReturnType<typeof countReviewReasons> => countReviewReasons(items);

export const latestIsoInstant = (values: readonly (string | null | undefined)[]): string | null =>
  values.reduce<string | null>((latest, value) => {
    if (value === null || value === undefined || value.length === 0) {
      return latest;
    }
    if (latest === null || value > latest) {
      return value;
    }
    return latest;
  }, null);
