import type { Task } from '@yoink/api-contracts';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import type { TaskEvent } from '../domain/events.js';

export type WriteResult<E extends TaskEvent = TaskEvent> = {
  event: E | null;
  view: Task;
  eventKinds: ChangeLogKind[];
};

export const kindsFromRecords = (records: ChangeLogRecord[]): ChangeLogKind[] =>
  records.map((record) => record.kind);
