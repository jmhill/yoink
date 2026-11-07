import { describe, expect, it } from 'vitest';
import type { IdGenerator } from '../../../kernel/id-generator.js';
import type { IntegrationEvent } from '../../../kernel/integration-event.js';
import {
  EMPTY_EVENT_SINK_MAP,
  planTimelineRecords,
  type EventRecordBuilder,
  type TimelineDraft,
} from './event-sink.js';

const event = (type: string, id = `${type}-event`): IntegrationEvent => ({
  id,
  type,
  schemaVersion: 1,
  organizationId: 'org-1',
  occurredAt: '2026-11-07T00:00:00.000Z',
  actor: { kind: 'user', userId: 'user-1', via: 'session' },
  subject: { type: 'task', id: 'task-1', projectId: 'project-1' },
  payload: { title: 'Sample' },
});

const draft = (subjectId: string): TimelineDraft => ({
  organizationId: 'org-1',
  projectId: 'project-1',
  subjectType: 'task',
  subjectId,
  kind: 'TaskCreated',
  schemaVersion: 1,
  payload: { title: 'Sample', openOrder: 0, createdById: 'user-1' },
  actorUserId: 'user-1',
  actorKind: 'user',
  occurredAt: '2026-11-07T00:00:00.000Z',
  hidden: false,
});

const one: EventRecordBuilder = (item) => [draft(item.subject.id)];

const ids = (): IdGenerator & { readonly count: () => number } => {
  let n = 0;
  return {
    count: () => n,
    generate: () => {
      n += 1;
      return `record-${n}`;
    },
  };
};

describe('planTimelineRecords', () => {
  it('assigns ids and skips types the map does not know', () => {
    const generator = ids();
    const records = planTimelineRecords({
      events: [event('SampleNoted', 'event-a'), event('NotMapped', 'event-b')],
      builders: { SampleNoted: one },
      ids: generator,
    });

    expect(generator.count()).toBe(1);
    expect(records).toEqual([
      {
        ...draft('task-1'),
        id: 'record-1',
      },
    ]);
    expect(records[0]?.id).not.toBe('event-a');
  });

  it('keeps builder order across several records', () => {
    const records = planTimelineRecords({
      events: [event('SampleNoted')],
      builders: {
        SampleNoted: () => [draft('task-1'), draft('task-2')],
      },
      ids: ids(),
    });

    expect(records.map((record) => record.id)).toEqual(['record-1', 'record-2']);
    expect(records.map((record) => record.subjectId)).toEqual(['task-1', 'task-2']);
  });

  it('writes nothing from the empty map', () => {
    const generator = ids();
    const records = planTimelineRecords({
      events: [event('SampleNoted')],
      builders: EMPTY_EVENT_SINK_MAP,
      ids: generator,
    });

    expect(records).toEqual([]);
    expect(generator.count()).toBe(0);
  });
});
