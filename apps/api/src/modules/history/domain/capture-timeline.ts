import type { IntegrationEvent } from '../../../kernel/integration-event.js';
import type { EventSinkMap, TimelineDraft } from './event-sink.js';

/**
 * History owns this map. It does not import captures. The type strings are the
 * published capture integration events. Visible timeline SQL still excludes
 * subject_type capture, so these rows are stored and not shown.
 */
const draft = (
  event: IntegrationEvent,
  kind: TimelineDraft['kind'],
  payload: TimelineDraft['payload']
): TimelineDraft => ({
  organizationId: event.organizationId,
  projectId: null,
  subjectType: 'capture',
  subjectId: event.subject.id,
  kind,
  schemaVersion: 1,
  payload,
  actorUserId: event.actor.userId,
  actorKind: event.actor.kind === 'bot' ? 'bot' : 'user',
  occurredAt: event.occurredAt,
  hidden: false,
});

const objectPayload = (event: IntegrationEvent): Record<string, unknown> =>
  typeof event.payload === 'object' && event.payload !== null
    ? (event.payload as Record<string, unknown>)
    : {};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const count = (value: unknown): number => (typeof value === 'number' ? value : 0);

export const CAPTURE_TIMELINE_BUILDERS: EventSinkMap = {
  CaptureCreated: (event) => [draft(event, 'CaptureCreated', { content: text(objectPayload(event).content) })],
  CaptureContentUpdated: (event) => {
    const payload = objectPayload(event);
    return [
      draft(event, 'CaptureContentUpdated', {
        ...(typeof payload.title === 'string' ? { title: payload.title } : {}),
        ...(typeof payload.content === 'string' ? { content: payload.content } : {}),
      }),
    ];
  },
  CaptureTrashed: (event) => [draft(event, 'CaptureTrashed', {})],
  CaptureRestored: (event) => [draft(event, 'CaptureRestored', {})],
  CaptureSnoozed: (event) => [draft(event, 'CaptureSnoozed', { until: text(objectPayload(event).until) })],
  CaptureUnsnoozed: (event) => [draft(event, 'CaptureUnsnoozed', {})],
  CaptureDeleted: (event) => [draft(event, 'CaptureDeleted', {})],
  CaptureTrashEmptied: (event) => [
    draft(event, 'CaptureTrashEmptied', { deletedCount: count(objectPayload(event).deletedCount) }),
  ],
  CaptureProcessed: (event) => {
    const payload = objectPayload(event);
    return [
      draft(event, 'CaptureProcessed', {
        processedToType: text(payload.processedToType),
        processedToId: text(payload.processedToId),
      }),
    ];
  },
};
