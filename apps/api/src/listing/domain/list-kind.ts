import {
  HISTORY_PAGE_DEFAULT,
  PILE_SAFETY_CAP,
  type CaptureStatus,
  type TaskFilter,
} from '@yoink/api-contracts';

export type ListKind = 'pile' | 'history';

export const resolveListLimit = (
  requested: number | undefined,
  kind: ListKind
): number => {
  const fallback = kind === 'history' ? HISTORY_PAGE_DEFAULT : PILE_SAFETY_CAP;
  const limit = requested ?? fallback;
  return Math.min(limit, PILE_SAFETY_CAP);
};

export const listKindForTaskFilter = (filter: TaskFilter | undefined): ListKind =>
  filter === 'completed' ? 'history' : 'pile';

export const listKindForCaptureList = (status: CaptureStatus | undefined): ListKind =>
  status === 'trashed' || status === 'processed' ? 'history' : 'pile';
