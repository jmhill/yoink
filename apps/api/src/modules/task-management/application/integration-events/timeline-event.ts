import type { Actor } from '../../../../kernel/auth-context.js';
import type { IntegrationEvent } from '../../../../kernel/integration-event.js';
import type { ChangeLogRecord } from '../../../history/domain/record.js';

export type CaptureSource = {
  readonly kind: 'capture';
  readonly id: string;
};

export type TimelineEventPayload = {
  readonly record: Omit<ChangeLogRecord, 'id'>;
  readonly source?: CaptureSource;
  /** The row is already in this commit. History writes nothing for it. */
  readonly timeline?: 'inline';
};

const actorFor = (record: ChangeLogRecord): Actor => {
  if (record.actorKind === 'bot') {
    const userId = record.actorUserId ?? 'bot';
    return { kind: 'bot', tokenId: userId, userId, name: 'bot', via: 'token' };
  }
  return { kind: 'user', userId: record.actorUserId ?? 'user', via: 'session' };
};

const captureSource = (record: ChangeLogRecord): CaptureSource | undefined => {
  if (record.kind !== 'TaskDeleted') {
    return undefined;
  }
  const captureId = record.payload.captureId;
  if (typeof captureId !== 'string' || captureId.length === 0) {
    return undefined;
  }
  return { kind: 'capture', id: captureId };
};

/** History copies `record` onto the timeline. `source` stays on the event. */
export const timelineEvent = (
  record: ChangeLogRecord,
  options?: { readonly inline?: boolean }
): IntegrationEvent<string, TimelineEventPayload> => {
  const { id, ...draft } = record;
  const source = captureSource(record);
  return {
    id,
    type: record.kind,
    schemaVersion: record.schemaVersion,
    organizationId: record.organizationId,
    occurredAt: record.occurredAt,
    actor: actorFor(record),
    subject: {
      type: record.subjectType,
      id: record.subjectId,
      ...(record.projectId !== null ? { projectId: record.projectId } : {}),
    },
    payload: {
      record: draft,
      ...(source ? { source } : {}),
      ...(options?.inline ? { timeline: 'inline' as const } : {}),
    },
  };
};
