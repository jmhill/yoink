import { describe, it, expect } from 'vitest';
import type { NamedList } from '@yoink/api-contracts';
import { applyNamedListEvent } from './apply-named-list-event.js';
import type { NamedListCreated } from './events.js';

describe('applyNamedListEvent', () => {
  describe('NamedListCreated', () => {
    const event: NamedListCreated = {
      type: 'NamedListCreated',
      id: 'list-id-1',
      organizationId: 'org-123',
      createdById: 'user-456',
      name: 'Groceries',
      createdAt: '2025-01-15T10:00:00.000Z',
    };

    it('projects a named list from the fact', () => {
      expect(applyNamedListEvent(null, event)).toEqual({
        id: 'list-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        name: 'Groceries',
        createdAt: '2025-01-15T10:00:00.000Z',
      });
    });
  });

  describe('NamedListDeleted', () => {
    it('projects the list away', () => {
      const current: NamedList = {
        id: 'list-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        name: 'Groceries',
        createdAt: '2025-01-15T10:00:00.000Z',
      };

      expect(
        applyNamedListEvent(current, {
          type: 'NamedListDeleted',
          id: 'list-id-1',
          organizationId: 'org-123',
        })
      ).toBeNull();
    });
  });
});
