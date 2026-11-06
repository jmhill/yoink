// Same numbers as PILE_SAFETY_CAP and HISTORY_PAGE_DEFAULT in
// `@yoink/api-contracts`. Kernel does not import that package.
const PILE_SAFETY_CAP = 1000;
const HISTORY_PAGE_DEFAULT = 50;

export type ListKind = 'pile' | 'history';

export const resolveListLimit = (
  requested: number | undefined,
  kind: ListKind
): number => {
  const fallback = kind === 'history' ? HISTORY_PAGE_DEFAULT : PILE_SAFETY_CAP;
  const limit = requested ?? fallback;
  return Math.min(limit, PILE_SAFETY_CAP);
};

// The unions match TaskFilter and CaptureStatus in `@yoink/api-contracts`.
export const listKindForTaskFilter = (
  filter: 'today' | 'upcoming' | 'all' | 'completed' | 'mine' | undefined
): ListKind => (filter === 'completed' ? 'history' : 'pile');

export const listKindForCaptureList = (
  status: 'inbox' | 'trashed' | 'processed' | undefined
): ListKind => (status === 'trashed' || status === 'processed' ? 'history' : 'pile');
