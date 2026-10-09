import { describe, it, expect } from 'vitest';
import { parseChangeLogRecord } from './parse-record.js';
import type { TaskCreatedRecord } from './record.js';

const created: TaskCreatedRecord = {
  id: 'log-1',
  organizationId: 'org-1',
  projectId: null,
  subjectType: 'task',
  subjectId: 'task-1',
  kind: 'TaskCreated',
  schemaVersion: 1,
  payload: {
    title: 'Buy milk',
    openOrder: 0,
    createdById: 'user-1',
  },
  actorUserId: null,
  actorKind: null,
  occurredAt: '2025-01-15T10:00:00.000Z',
  hidden: false,
};

describe('parseChangeLogRecord', () => {
  it('accepts a TaskCreated v1 record', () => {
    const result = parseChangeLogRecord(created);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(created);
    }
  });

  it('rejects an unknown schema version', () => {
    const result = parseChangeLogRecord({
      ...created,
      schemaVersion: 99,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CHANGE_LOG_PARSE_ERROR');
      expect(result.error.message).toContain('Unknown schema version');
    }
  });

  it('rejects a payload that does not match the kind schema', () => {
    const result = parseChangeLogRecord({
      ...created,
      payload: { openOrder: 0 },
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects a missing projectId key — null is required so project stories can fill it in', () => {
    const { projectId: _projectId, ...without } = created;
    const result = parseChangeLogRecord(without);
    expect(result.isErr()).toBe(true);
  });
});
