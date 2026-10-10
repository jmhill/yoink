export const CHANGE_LOG_SUBJECT_TYPES = ['task', 'list'] as const;
export type ChangeLogSubjectType = (typeof CHANGE_LOG_SUBJECT_TYPES)[number];

export const CHANGE_LOG_KINDS = [
  'TaskCreated',
  'TaskUpdated',
  'TaskCompleted',
  'TaskUncompleted',
  'TaskDeleted',
  'TaskPinned',
  'TaskUnpinned',
  'OpenTasksReordered',
  'OpenTasksRenumbered',
  'NamedListCreated',
  'NamedListRenamed',
  'NamedListDeleted',
] as const;

export type ChangeLogKind = (typeof CHANGE_LOG_KINDS)[number];

/** Hidden records are stored but never shown on a timeline and do not count toward last-changed. */
export const HIDDEN_CHANGE_LOG_KINDS = [
  'TaskPinned',
  'TaskUnpinned',
  'OpenTasksReordered',
  'OpenTasksRenumbered',
] as const;

export type HiddenChangeLogKind = (typeof HIDDEN_CHANGE_LOG_KINDS)[number];

const hiddenKindSet: ReadonlySet<string> = new Set(HIDDEN_CHANGE_LOG_KINDS);

export const isHiddenChangeLogKind = (kind: ChangeLogKind): boolean =>
  hiddenKindSet.has(kind);

export function hiddenFor(kind: HiddenChangeLogKind): true;
export function hiddenFor(kind: Exclude<ChangeLogKind, HiddenChangeLogKind>): false;
export function hiddenFor(kind: ChangeLogKind): boolean {
  return hiddenKindSet.has(kind);
}

export const countsTowardLastChanged = (kind: ChangeLogKind): boolean =>
  !hiddenKindSet.has(kind);

/** Unlisted pile identity for list-scoped reorder/renumber records. Disambiguated by organizationId. */
export const UNLISTED_PILE_SUBJECT_ID = 'unlisted';
