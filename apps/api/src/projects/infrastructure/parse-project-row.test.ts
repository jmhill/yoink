import { describe, it, expect } from 'vitest';
import { parseProjectRow } from './parse-project-row.js';

const garden = {
  id: 'project-1',
  organization_id: 'org-1',
  created_by_id: 'user-1',
  name: 'Garden',
  objective: 'Grow tomatoes',
  status: 'active',
  created_at: '2025-01-15T10:00:00.000Z',
  last_changed_at: '2025-01-15T10:00:00.000Z',
  last_changed_by: 'user-1',
};

describe('parseProjectRow', () => {
  it('maps a valid row', () => {
    const result = parseProjectRow(garden);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        id: 'project-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        name: 'Garden',
        objective: 'Grow tomatoes',
        status: 'active',
        createdAt: '2025-01-15T10:00:00.000Z',
        lastChangedAt: '2025-01-15T10:00:00.000Z',
        lastChangedBy: 'user-1',
      });
    }
  });

  it('accepts a null objective and last-changed', () => {
    const result = parseProjectRow({
      ...garden,
      objective: null,
      last_changed_at: null,
      last_changed_by: null,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.objective).toBeUndefined();
      expect(result.value.lastChangedAt).toBeNull();
      expect(result.value.lastChangedBy).toBeNull();
    }
  });

  it('returns STORAGE_ERROR for an unknown status', () => {
    const result = parseProjectRow({ ...garden, status: 'archived' });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });

  it('returns STORAGE_ERROR for a missing name', () => {
    const { name: _name, ...without } = garden;
    const result = parseProjectRow(without);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
