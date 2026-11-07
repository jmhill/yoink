import { describe, it, expect } from 'vitest';
import { rowToHistoryItem } from './sqlite-change-log-store.js';

describe('rowToHistoryItem', () => {
  it('returns STORAGE_ERROR for an unreadable seq', () => {
    const result = rowToHistoryItem({
      id: 'log-1',
      organization_id: 'org-1',
      project_id: 'project-1',
      subject_type: 'project',
      subject_id: 'project-1',
      kind: 'ProjectCreated',
      schema_version: 1,
      payload_json: '{"name":"Kitchen"}',
      actor_user_id: 'user-1',
      actor_kind: 'user',
      occurred_at: '2026-10-11T15:00:00.000Z',
      hidden: 0,
      seq: 'not-a-number',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
