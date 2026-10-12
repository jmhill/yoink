import type { ReviewProject } from '@yoink/api-contracts';

export type ReviewWaitingGroup = {
  readonly key: string;
  readonly label: string;
  readonly items: readonly ReviewProject[];
};

export const waitingGroupKey = (waitingOn: string | null): string =>
  (waitingOn ?? '').trim().toLowerCase();

export const reviewSectionOf = (
  item: ReviewProject
): 'noNextAction' | 'quiet' | 'waiting' => {
  if (item.project.status === 'active' && item.reasons.includes('noNextAction')) {
    return 'noNextAction';
  }
  if (item.reasons.includes('quiet')) {
    return 'quiet';
  }
  return 'waiting';
};

export const partitionReviewSections = (projects: readonly ReviewProject[]) => ({
  noNextAction: projects.filter((item) => reviewSectionOf(item) === 'noNextAction'),
  quiet: projects.filter((item) => reviewSectionOf(item) === 'quiet'),
  waiting: projects.filter((item) => reviewSectionOf(item) === 'waiting'),
});

export const groupWaitingProjects = (
  items: readonly ReviewProject[]
): readonly ReviewWaitingGroup[] =>
  items.reduce<ReviewWaitingGroup[]>((groups, item) => {
    const key = waitingGroupKey(item.project.waitingOn);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      return [
        ...groups.slice(0, -1),
        { key: last.key, label: last.label, items: [...last.items, item] },
      ];
    }
    const trimmed = (item.project.waitingOn ?? '').trim();
    return [
      ...groups,
      {
        key,
        label: trimmed.length > 0 ? trimmed : 'Waiting',
        items: [item],
      },
    ];
  }, []);

export const reviewAttentionCount = (projects: readonly ReviewProject[]): number =>
  projects.filter(
    (item) =>
      (item.project.status === 'active' && item.reasons.includes('noNextAction')) ||
      item.reasons.includes('quiet')
  ).length;

export const reviewVersionOf = (projects: readonly ReviewProject[]): string =>
  projects
    .map((item) => `${item.project.id}:${item.reasons.join(',')}:${item.lastChangeAt}`)
    .join('|');
