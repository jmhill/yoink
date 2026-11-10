import type { ProjectStatus, ReviewReason } from '@yoink/api-contracts';

export const QUIET_AFTER_DAYS = 7;

export const reviewReasons = (input: {
  readonly status: ProjectStatus;
  readonly nextActionTaskId: string | null;
  readonly daysSinceChange: number;
}): readonly ReviewReason[] => {
  const noNextAction =
    (input.status === 'active' || input.status === 'waiting') &&
    input.nextActionTaskId === null;
  const quiet = input.status === 'active' && input.daysSinceChange >= QUIET_AFTER_DAYS;
  const waiting = input.status === 'waiting';
  return [
    ...(noNextAction ? (['noNextAction'] as const) : []),
    ...(quiet ? (['quiet'] as const) : []),
    ...(waiting ? (['waiting'] as const) : []),
  ];
};
