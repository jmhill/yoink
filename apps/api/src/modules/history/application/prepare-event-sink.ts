import type { IdGenerator } from '../../../kernel/id-generator.js';
import type { EventSink } from '../../../kernel/unit-of-work.js';
import {
  planTimelineRecords,
  type EventSinkMap,
} from '../domain/event-sink.js';

/** Prepare only. Compile stays on the history participant. An empty plan is null. */
export const createHistoryEventSink = (deps: {
  readonly ids: IdGenerator;
  readonly builders: EventSinkMap;
}): EventSink => ({
  owner: 'history',
  prepare: (events) => {
    const records = planTimelineRecords({
      events,
      builders: deps.builders,
      ids: deps.ids,
    });
    return records.length === 0 ? null : records;
  },
});
