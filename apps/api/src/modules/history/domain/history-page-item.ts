import type { ChangeLogRecord } from './record.js';

export type ChangeLogStorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type UnparsedHistoryRow = {
  readonly type: 'UNPARSED';
  readonly id: string;
  readonly kind: string;
  readonly occurredAt: string;
  readonly actorUserId: string | null;
  readonly actorKind: 'user' | 'bot' | null;
  readonly subjectType: 'task' | 'project' | 'note' | 'list' | 'unrecognised';
  readonly subjectId: string;
};

export type HistoryPageItem = {
  occurredAt: string;
  seq: number;
  record: ChangeLogRecord | UnparsedHistoryRow;
};

export const isUnparsedHistoryRow = (
  record: ChangeLogRecord | UnparsedHistoryRow
): record is UnparsedHistoryRow => 'type' in record && record.type === 'UNPARSED';
