import type { ActorKind } from '../../actor.js';
import type { ChangeLogSubjectType } from './kinds.js';
import type {
  NamedListCreatedPayloadV1,
  NamedListDeletedPayloadV1,
  NamedListRenamedPayloadV1,
  OpenTasksRenumberedPayloadV1,
  OpenTasksReorderedPayloadV1,
  TaskCompletedPayloadV1,
  TaskCreatedPayloadV1,
  TaskDeletedPayloadV1,
  TaskPinnedPayloadV1,
  TaskUncompletedPayloadV1,
  TaskUnpinnedPayloadV1,
  TaskUpdatedPayloadV1,
} from './payloads.js';

type RecordBase = {
  id: string;
  organizationId: string;
  /** Always null until projects (#134+) land; timeline (#138) and last-change (#145) will fill it. */
  projectId: string | null;
  subjectType: ChangeLogSubjectType;
  subjectId: string;
  actorUserId: string | null;
  actorKind: ActorKind | null;
  occurredAt: string;
  hidden: boolean;
};

export type TaskCreatedRecord = RecordBase & {
  kind: 'TaskCreated';
  schemaVersion: 1;
  payload: TaskCreatedPayloadV1;
};

export type TaskUpdatedRecord = RecordBase & {
  kind: 'TaskUpdated';
  schemaVersion: 1;
  payload: TaskUpdatedPayloadV1;
};

export type TaskCompletedRecord = RecordBase & {
  kind: 'TaskCompleted';
  schemaVersion: 1;
  payload: TaskCompletedPayloadV1;
};

export type TaskUncompletedRecord = RecordBase & {
  kind: 'TaskUncompleted';
  schemaVersion: 1;
  payload: TaskUncompletedPayloadV1;
};

export type TaskDeletedRecord = RecordBase & {
  kind: 'TaskDeleted';
  schemaVersion: 1;
  payload: TaskDeletedPayloadV1;
};

export type TaskPinnedRecord = RecordBase & {
  kind: 'TaskPinned';
  schemaVersion: 1;
  payload: TaskPinnedPayloadV1;
};

export type TaskUnpinnedRecord = RecordBase & {
  kind: 'TaskUnpinned';
  schemaVersion: 1;
  payload: TaskUnpinnedPayloadV1;
};

export type OpenTasksReorderedRecord = RecordBase & {
  kind: 'OpenTasksReordered';
  schemaVersion: 1;
  payload: OpenTasksReorderedPayloadV1;
};

export type OpenTasksRenumberedRecord = RecordBase & {
  kind: 'OpenTasksRenumbered';
  schemaVersion: 1;
  payload: OpenTasksRenumberedPayloadV1;
};

export type NamedListCreatedRecord = RecordBase & {
  kind: 'NamedListCreated';
  schemaVersion: 1;
  payload: NamedListCreatedPayloadV1;
};

export type NamedListRenamedRecord = RecordBase & {
  kind: 'NamedListRenamed';
  schemaVersion: 1;
  payload: NamedListRenamedPayloadV1;
};

export type NamedListDeletedRecord = RecordBase & {
  kind: 'NamedListDeleted';
  schemaVersion: 1;
  payload: NamedListDeletedPayloadV1;
};

export type ChangeLogRecord =
  | TaskCreatedRecord
  | TaskUpdatedRecord
  | TaskCompletedRecord
  | TaskUncompletedRecord
  | TaskDeletedRecord
  | TaskPinnedRecord
  | TaskUnpinnedRecord
  | OpenTasksReorderedRecord
  | OpenTasksRenumberedRecord
  | NamedListCreatedRecord
  | NamedListRenamedRecord
  | NamedListDeletedRecord;

export type ChangeLogParseError = {
  readonly type: 'CHANGE_LOG_PARSE_ERROR';
  readonly message: string;
};
