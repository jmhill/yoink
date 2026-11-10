import type { Actor } from '../../../../kernel/auth-context.js';
import type { IntegrationEvent } from '../../../../kernel/integration-event.js';
import type { NoteEvent } from '../../domain/messages/events.js';

export type NoteIntegrationEvent = IntegrationEvent<NoteEvent['type'], Record<string, unknown>>;

const payloadOf = (event: NoteEvent): Record<string, unknown> => {
  switch (event.type) {
    case 'NoteCreated':
      return {
        title: event.title,
        ...(event.origin === 'obsidian' ? { origin: 'obsidian' as const } : {}),
      };
    case 'NoteUpdated':
      return {
        title: event.title,
        titleChanged: event.titleChanged,
        bodyChanged: event.bodyChanged,
        ...(event.origin === 'obsidian' ? { origin: 'obsidian' as const } : {}),
      };
    case 'NoteDeleted':
      return { title: event.title };
  }
};

/**
 * The integration event id is not a change-log record id. History assigns
 * those when it prepares the sink.
 */
export const toNoteIntegrationEvent = (input: {
  event: NoteEvent;
  id: string;
  occurredAt: string;
  actor: Actor;
}): NoteIntegrationEvent => ({
  id: input.id,
  type: input.event.type,
  schemaVersion: 1,
  organizationId: input.event.organizationId,
  occurredAt: input.occurredAt,
  actor: input.actor,
  subject: { type: 'note', id: input.event.id, projectId: input.event.projectId },
  payload: payloadOf(input.event),
});
