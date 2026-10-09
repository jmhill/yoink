import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { ChangeLogKind } from './kinds.js';
import { CHANGE_LOG_KINDS } from './kinds.js';
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
import type { ChangeLogParseError, ChangeLogRecord } from './record.js';

const kindSchema = z.enum(
  CHANGE_LOG_KINDS as unknown as [ChangeLogKind, ...ChangeLogKind[]]
);

const envelopeSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  projectId: z.string().nullable(),
  subjectType: z.enum(['task', 'list']),
  subjectId: z.string().min(1),
  kind: kindSchema,
  schemaVersion: z.number().int(),
  payload: z.unknown(),
  actorUserId: z.string().nullable(),
  actorKind: z.enum(['user', 'bot']).nullable(),
  occurredAt: z.string().datetime(),
  hidden: z.boolean(),
});

const payloadSchemaByKindVersion: Record<
  ChangeLogKind,
  Record<number, z.ZodType>
> = {
  TaskCreated: { 1: taskCreatedPayloadV1Schema },
  TaskUpdated: { 1: taskUpdatedPayloadV1Schema },
  TaskCompleted: { 1: taskCompletedPayloadV1Schema },
  TaskUncompleted: { 1: taskUncompletedPayloadV1Schema },
  TaskDeleted: { 1: taskDeletedPayloadV1Schema },
  TaskPinned: { 1: taskPinnedPayloadV1Schema },
  TaskUnpinned: { 1: taskUnpinnedPayloadV1Schema },
  OpenTasksReordered: { 1: openTasksReorderedPayloadV1Schema },
  OpenTasksRenumbered: { 1: openTasksRenumberedPayloadV1Schema },
  NamedListCreated: { 1: namedListCreatedPayloadV1Schema },
  NamedListRenamed: { 1: namedListRenamedPayloadV1Schema },
  NamedListDeleted: { 1: namedListDeletedPayloadV1Schema },
};

export const changeLogParseError = (message: string): ChangeLogParseError => ({
  type: 'CHANGE_LOG_PARSE_ERROR',
  message,
});

export const parseChangeLogRecord = (
  raw: unknown
): Result<ChangeLogRecord, ChangeLogParseError> => {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return err(changeLogParseError('Change log envelope did not match schema'));
  }

  const payloadSchema =
    payloadSchemaByKindVersion[envelope.data.kind][envelope.data.schemaVersion];
  if (!payloadSchema) {
    return err(
      changeLogParseError(
        `Unknown schema version ${envelope.data.schemaVersion} for ${envelope.data.kind}`
      )
    );
  }

  const payload = payloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return err(
      changeLogParseError(`Change log payload did not match ${envelope.data.kind} v${envelope.data.schemaVersion}`)
    );
  }

  return ok({
    ...envelope.data,
    payload: payload.data,
  } as ChangeLogRecord);
};
