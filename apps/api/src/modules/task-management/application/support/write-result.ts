import type { Task } from '@yoink/api-contracts';
import type { ChangeLogKind } from '../../../history/domain/kinds.js';
import type { ChangeLogRecord } from '../../../history/domain/record.js';
import type { TaskEvent } from '../../domain/messages/task-events.js';

export type WriteResult<E extends TaskEvent = TaskEvent> = {
  event: E | null;
  view: Task;
  eventKinds: ChangeLogKind[];
};

export const kindsFromRecords = (records: ChangeLogRecord[]): ChangeLogKind[] =>
  records.map((record) => record.kind);
