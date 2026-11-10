import type { IntegrationEvent } from '../../../kernel/integration-event.js';
import type { EventSinkMap, TimelineDraft } from './event-sink.js';

/**
 * History owns this map. It does not import notes. The type strings are the
 * published note integration events. Payloads match the v1 timeline schemas.
 */
const draft = (
  event: IntegrationEvent,
  kind: 'NoteCreated' | 'NoteUpdated' | 'NoteDeleted',
  payload: TimelineDraft['payload']
): TimelineDraft => ({
  organizationId: event.organizationId,
  projectId: event.subject.projectId ?? null,
  subjectType: 'note',
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

const flag = (value: unknown): boolean => value === true;

const origin = (payload: Record<string, unknown>): { origin: 'obsidian' } | Record<string, never> =>
  payload.origin === 'obsidian' ? { origin: 'obsidian' } : {};

export const NOTE_TIMELINE_BUILDERS: EventSinkMap = {
  NoteCreated: (event) => {
    const payload = objectPayload(event);
    return [draft(event, 'NoteCreated', { title: text(payload.title), ...origin(payload) })];
  },
  NoteUpdated: (event) => {
    const payload = objectPayload(event);
    return [
      draft(event, 'NoteUpdated', {
        title: text(payload.title),
        titleChanged: flag(payload.titleChanged),
        bodyChanged: flag(payload.bodyChanged),
        ...origin(payload),
      }),
    ];
  },
  NoteDeleted: (event) => [draft(event, 'NoteDeleted', { title: text(objectPayload(event).title) })],
};
