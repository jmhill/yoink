import { describe, expect, it } from 'vitest';
import type { ChangeLogRecord } from '../../../history/domain/record.js';
import { TASK_TIMELINE_BUILDERS } from '../../../history/domain/task-timeline.js';
import { timelineEvent } from './timeline-event.js';

const occurredAt = '2026-11-09T12:00:00.000Z';

const taskDeleted = (captureId?: string): ChangeLogRecord => ({
  id: 'log-1',
  organizationId: 'org-1',
  projectId: null,
  subjectType: 'task',
  subjectId: 'task-1',
  kind: 'TaskDeleted',
  schemaVersion: 1,
  payload: captureId === undefined ? {} : { captureId },
  actorUserId: 'user-1',
  actorKind: 'user',
  occurredAt,
  hidden: false,
});

describe('task timeline events', () => {
  it('carries a capture source and history stores only captureId', () => {
    const event = timelineEvent(taskDeleted('cap-1'));

    expect(event.payload.source).toEqual({ kind: 'capture', id: 'cap-1' });
    expect(event.payload.record.payload).toEqual({ captureId: 'cap-1' });

    const build = TASK_TIMELINE_BUILDERS.TaskDeleted;
    expect(build).toBeDefined();
    expect(build?.(event)).toEqual([
      expect.objectContaining({
        kind: 'TaskDeleted',
        payload: { captureId: 'cap-1' },
      }),
    ]);
  });

  it('omits source when the task did not come from a capture', () => {
    const event = timelineEvent(taskDeleted());
    expect(event.payload.source).toBeUndefined();
  });
});
