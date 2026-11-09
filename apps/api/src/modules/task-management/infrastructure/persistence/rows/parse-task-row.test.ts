import { describe, it, expect } from 'vitest';
import { parseTaskRow } from './parse-task-row.js';

const milk = {
  id: 'task-1',
  organization_id: 'org-1',
  created_by_id: 'user-1',
  title: 'Buy milk',
  capture_id: null,
  due_date: null,
  completed_at: null,
  pinned_at: null,
  created_at: '2025-01-15T10:00:00.000Z',
  assignee_id: null,
  list_id: null,
  project_id: null,
  open_order: 0,
  last_changed_at: null,
  last_changed_by: null,
  completed_by: null,
};

describe('parseTaskRow', () => {
  it('maps a valid row', () => {
    const result = parseTaskRow(milk);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        id: 'task-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'Buy milk',
        createdAt: '2025-01-15T10:00:00.000Z',
        openOrder: 0,
        lastChangedAt: null,
        lastChangedBy: null,
        completedBy: null,
      });
    }
  });

  it('maps listId and projectId when present', () => {
    const result = parseTaskRow({
      ...milk,
      list_id: 'list-1',
      project_id: 'project-1',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.listId).toBe('list-1');
      expect(result.value.projectId).toBe('project-1');
    }
  });

  it('returns STORAGE_ERROR for a missing title', () => {
    const { title: _title, ...without } = milk;
    const result = parseTaskRow(without);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
