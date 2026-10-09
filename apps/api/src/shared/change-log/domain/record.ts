import { z } from 'zod';
import {
  namedListCreatedPayloadV1Schema,
  namedListDeletedPayloadV1Schema,
  namedListRenamedPayloadV1Schema,
  openTasksRenumberedPayloadV1Schema,
  openTasksReorderedPayloadV1Schema,
  taskCompletedPayloadV1Schema,
  taskCreatedPayloadV1Schema,
  taskDeletedPayloadV1Schema,
  taskPinnedPayloadV1Schema,
  taskUncompletedPayloadV1Schema,
  taskUnpinnedPayloadV1Schema,
  taskUpdatedPayloadV1Schema,
} from './payloads.js';

const envelope = {
  id: z.string().min(1),
  organizationId: z.string().min(1),
  /** Always null until projects (#134+) land; timeline (#138) and last-change (#145) will fill it. */
  projectId: z.string().nullable(),
  subjectType: z.enum(['task', 'list']),
  subjectId: z.string().min(1),
  actorUserId: z.string().nullable(),
  actorKind: z.enum(['user', 'bot']).nullable(),
  occurredAt: z.string().datetime(),
};

const visibleV1 = {
  schemaVersion: z.literal(1),
  hidden: z.literal(false),
} as const;

const hiddenV1 = {
  schemaVersion: z.literal(1),
  hidden: z.literal(true),
} as const;

export const taskCreatedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('TaskCreated'),
  ...visibleV1,
  payload: taskCreatedPayloadV1Schema,
});

export const taskUpdatedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('TaskUpdated'),
  ...visibleV1,
  payload: taskUpdatedPayloadV1Schema,
});

export const taskCompletedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('TaskCompleted'),
  ...visibleV1,
  payload: taskCompletedPayloadV1Schema,
});

export const taskUncompletedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('TaskUncompleted'),
  ...visibleV1,
  payload: taskUncompletedPayloadV1Schema,
});

export const taskDeletedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('TaskDeleted'),
  ...visibleV1,
  payload: taskDeletedPayloadV1Schema,
});

export const taskPinnedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('TaskPinned'),
  ...hiddenV1,
  payload: taskPinnedPayloadV1Schema,
});

export const taskUnpinnedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('TaskUnpinned'),
  ...hiddenV1,
  payload: taskUnpinnedPayloadV1Schema,
});

export const openTasksReorderedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('OpenTasksReordered'),
  ...hiddenV1,
  payload: openTasksReorderedPayloadV1Schema,
});

export const openTasksRenumberedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('OpenTasksRenumbered'),
  ...hiddenV1,
  payload: openTasksRenumberedPayloadV1Schema,
});

export const namedListCreatedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('NamedListCreated'),
  ...visibleV1,
  payload: namedListCreatedPayloadV1Schema,
});

export const namedListRenamedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('NamedListRenamed'),
  ...visibleV1,
  payload: namedListRenamedPayloadV1Schema,
});

export const namedListDeletedRecordSchema = z.object({
  ...envelope,
  kind: z.literal('NamedListDeleted'),
  ...visibleV1,
  payload: namedListDeletedPayloadV1Schema,
});

export const changeLogRecordSchema = z.discriminatedUnion('kind', [
  taskCreatedRecordSchema,
  taskUpdatedRecordSchema,
  taskCompletedRecordSchema,
  taskUncompletedRecordSchema,
  taskDeletedRecordSchema,
  taskPinnedRecordSchema,
  taskUnpinnedRecordSchema,
  openTasksReorderedRecordSchema,
  openTasksRenumberedRecordSchema,
  namedListCreatedRecordSchema,
  namedListRenamedRecordSchema,
  namedListDeletedRecordSchema,
]);

export type ChangeLogRecord = z.infer<typeof changeLogRecordSchema>;
export type TaskCreatedRecord = z.infer<typeof taskCreatedRecordSchema>;
export type TaskUpdatedRecord = z.infer<typeof taskUpdatedRecordSchema>;
export type TaskCompletedRecord = z.infer<typeof taskCompletedRecordSchema>;
export type TaskUncompletedRecord = z.infer<typeof taskUncompletedRecordSchema>;
export type TaskDeletedRecord = z.infer<typeof taskDeletedRecordSchema>;
export type TaskPinnedRecord = z.infer<typeof taskPinnedRecordSchema>;
export type TaskUnpinnedRecord = z.infer<typeof taskUnpinnedRecordSchema>;
export type OpenTasksReorderedRecord = z.infer<typeof openTasksReorderedRecordSchema>;
export type OpenTasksRenumberedRecord = z.infer<typeof openTasksRenumberedRecordSchema>;
export type NamedListCreatedRecord = z.infer<typeof namedListCreatedRecordSchema>;
export type NamedListRenamedRecord = z.infer<typeof namedListRenamedRecordSchema>;
export type NamedListDeletedRecord = z.infer<typeof namedListDeletedRecordSchema>;

export type ChangeLogParseError = {
  readonly type: 'CHANGE_LOG_PARSE_ERROR';
  readonly message: string;
};
