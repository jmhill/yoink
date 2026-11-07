import type { IdGenerator } from '../../../kernel/id-generator.js';
import type { IntegrationEvent } from '../../../kernel/integration-event.js';
import type { ChangeLogRecord } from './record.js';

/** A timeline row without its id. Prepare assigns the id. */
export type TimelineDraft = Omit<ChangeLogRecord, 'id'>;

/** One integration event type. Unknown types are skipped. The production map is empty. */
export type EventRecordBuilder = (event: IntegrationEvent) => readonly TimelineDraft[];

export type EventSinkMap = Readonly<Record<string, EventRecordBuilder>>;

export const EMPTY_EVENT_SINK_MAP: EventSinkMap = {};

/**
 * Maps events in order. Record ids come from the generator, not the event id.
 * A type with no builder writes nothing.
 */
export const planTimelineRecords = (input: {
  readonly events: readonly IntegrationEvent[];
  readonly builders: EventSinkMap;
  readonly ids: IdGenerator;
}): readonly ChangeLogRecord[] => {
  const records: ChangeLogRecord[] = [];
  for (const event of input.events) {
    const build = input.builders[event.type];
    if (build === undefined) {
      continue;
    }
    for (const draft of build(event)) {
      // Omit does not distribute over the record union. The participant parses again.
      records.push({ ...draft, id: input.ids.generate() } as ChangeLogRecord);
    }
  }
  return records;
};
