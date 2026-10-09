import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';

export const eventKindsOf = (result: { eventKinds: ChangeLogKind[] }): ChangeLogKind[] =>
  result.eventKinds;
