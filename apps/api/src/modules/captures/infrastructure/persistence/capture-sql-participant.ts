import type { Capture } from '@yoink/api-contracts';
import type { GuardedStatement, SqlParticipant } from '../../../../kernel/unit-of-work.js';
import type { CapturePlan, CaptureWrite } from '../../domain/projections/plan-capture.js';

const isWrite = (value: unknown): value is CaptureWrite => {
  if (typeof value !== 'object' || value === null || !('op' in value)) {
    return false;
  }
  const op = value.op;
  return (
    op === 'insert' ||
    op === 'update' ||
    op === 'soft-delete' ||
    op === 'empty-trash' ||
    op === 'mark-processed'
  );
};

const isPlan = (plan: unknown): plan is CapturePlan => {
  if (typeof plan !== 'object' || plan === null || !('writes' in plan)) {
    return false;
  }
  const writes = plan.writes;
  return Array.isArray(writes) && writes.every(isWrite);
};

const insertCapture = (capture: Capture): GuardedStatement => ({
  verb: 'insert',
  guard: false,
  sql: `
    INSERT INTO captures (
      id, organization_id, created_by_id, content, title,
      source_url, source_app, status, captured_at, trashed_at, snoozed_until
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  args: [
    capture.id,
    capture.organizationId,
    capture.createdById,
    capture.content,
    capture.title ?? null,
    capture.sourceUrl ?? null,
    capture.sourceApp ?? null,
    capture.status,
    capture.capturedAt,
    capture.trashedAt ?? null,
    capture.snoozedUntil ?? null,
  ],
});

const updateCapture = (capture: Capture): GuardedStatement => ({
  verb: 'update',
  guard: false,
  sql: `
    UPDATE captures SET
      content = ?,
      title = ?,
      status = ?,
      trashed_at = ?,
      snoozed_until = ?,
      processed_at = ?,
      processed_to_type = ?,
      processed_to_id = ?
    WHERE id = ?
  `,
  args: [
    capture.content,
    capture.title ?? null,
    capture.status,
    capture.trashedAt ?? null,
    capture.snoozedUntil ?? null,
    capture.processedAt ?? null,
    capture.processedToType ?? null,
    capture.processedToId ?? null,
    capture.id,
  ],
});

const statementFor = (write: CaptureWrite): GuardedStatement => {
  switch (write.op) {
    case 'insert':
      return insertCapture(write.capture);
    case 'update':
      return updateCapture(write.capture);
    case 'soft-delete':
      return {
        verb: 'update',
        guard: false,
        sql: `
          UPDATE captures SET deleted_at = ?
          WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
        `,
        args: [write.deletedAt, write.id, write.organizationId],
      };
    case 'empty-trash':
      return {
        verb: 'update',
        guard: false,
        sql: `
          UPDATE captures SET deleted_at = ?
          WHERE organization_id = ? AND status = 'trashed' AND deleted_at IS NULL
        `,
        args: [write.deletedAt, write.organizationId],
      };
    case 'mark-processed':
      return {
        verb: 'update',
        guard: true,
        sql: `
          UPDATE captures SET
            status = 'processed',
            processed_at = ?,
            processed_to_type = ?,
            processed_to_id = ?
          WHERE id = ? AND organization_id = ? AND status = 'inbox' AND deleted_at IS NULL
        `,
        args: [
          write.processedAt,
          write.processedToType,
          write.processedToId,
          write.id,
          write.organizationId,
        ],
      };
  }
};

/** A plan this participant does not understand fails closed as a rejected write. */
const rejected = (): readonly GuardedStatement[] => [
  { verb: 'insert', sql: '', args: [], guard: false },
];

export const compileCapturePlan = (plan: unknown): readonly GuardedStatement[] => {
  if (!isPlan(plan)) {
    return rejected();
  }
  return plan.writes.map(statementFor);
};

export const capturesSqlParticipant: SqlParticipant<unknown> = {
  owner: 'captures',
  compile: compileCapturePlan,
};
