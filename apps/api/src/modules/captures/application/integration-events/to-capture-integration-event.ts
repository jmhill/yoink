import type { Actor } from '../../../../kernel/auth-context.js';
import type { IntegrationEvent } from '../../../../kernel/integration-event.js';
import type { CaptureEvent } from '../../domain/messages/events.js';

export type CaptureIntegrationEvent = IntegrationEvent<string, Record<string, unknown>>;

const payloadOf = (
  event: Exclude<CaptureEvent, { type: 'Noop' }>,
  deletedCount: number | undefined
): Record<string, unknown> => {
  switch (event.type) {
    case 'CaptureCreated':
      return { content: event.content };
    case 'CaptureContentUpdated':
      return {
        ...(event.title !== undefined ? { title: event.title } : {}),
        ...(event.content !== undefined ? { content: event.content } : {}),
      };
    case 'CaptureSnoozed':
      return { until: event.until };
    case 'CaptureTrashEmptied':
      return { deletedCount: deletedCount ?? 0 };
    case 'CaptureTrashed':
    case 'CaptureRestored':
    case 'CaptureUnsnoozed':
    case 'CaptureDeleted':
      return {};
  }
};

/**
 * The integration event id is not a change-log record id. History assigns
 * those when it prepares the sink.
 */
export const captureProcessedIntegrationEvent = (input: {
  id: string;
  captureId: string;
  organizationId: string;
  occurredAt: string;
  actor: Actor;
  processedToType: string;
  processedToId: string;
}): CaptureIntegrationEvent => ({
  id: input.id,
  type: 'CaptureProcessed',
  schemaVersion: 1,
  organizationId: input.organizationId,
  occurredAt: input.occurredAt,
  actor: input.actor,
  subject: { type: 'capture', id: input.captureId },
  payload: {
    processedToType: input.processedToType,
    processedToId: input.processedToId,
  },
});

export const toCaptureIntegrationEvent = (input: {
  event: Exclude<CaptureEvent, { type: 'Noop' }>;
  id: string;
  occurredAt: string;
  actor: Actor;
  deletedCount?: number;
}): CaptureIntegrationEvent => ({
  id: input.id,
  type: input.event.type,
  schemaVersion: 1,
  organizationId: input.event.organizationId,
  occurredAt: input.occurredAt,
  actor: input.actor,
  subject: {
    type: 'capture',
    id: input.event.type === 'CaptureTrashEmptied' ? input.event.organizationId : input.event.id,
  },
  payload: payloadOf(input.event, input.deletedCount),
});
