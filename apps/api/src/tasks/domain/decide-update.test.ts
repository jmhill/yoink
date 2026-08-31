import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { decideUpdateTask } from './decide-update.js';

const current: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
};

const groceries = { id: 'list-groceries', organizationId: 'org-123' };
const weekend = { id: 'list-weekend', organizationId: 'org-123' };
const otherOrgList = { id: 'list-other', organizationId: 'org-other' };

describe('decideUpdateTask', () => {
  it('sets a list on an unlisted task', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: groceries.id,
      },
      list: groceries,
      assigneeInOrganization: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'TaskUpdated',
        id: 'task-123',
        organizationId: 'org-123',
        title: undefined,
        dueDate: undefined,
        assigneeId: undefined,
        listId: 'list-groceries',
      });
    }
  });

  it('replaces one list with another in the same organization', () => {
    const onGroceries: Task = { ...current, listId: groceries.id };

    const result = decideUpdateTask({
      current: onGroceries,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: weekend.id,
      },
      list: weekend,
      assigneeInOrganization: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.listId).toBe('list-weekend');
    }
  });

  it('rejects an unknown list', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: 'list-missing',
      },
      list: null,
      assigneeInOrganization: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
  });

  it('rejects a list from another organization', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: otherOrgList.id,
      },
      list: otherOrgList,
      assigneeInOrganization: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
  });

  it('omits listId from the event when the command does not set a list', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        title: 'Buy oat milk',
      },
      list: null,
      assigneeInOrganization: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.listId).toBeUndefined();
      expect(result.value.title).toBe('Buy oat milk');
    }
  });

  it('rejects an assignee who is not in the organization', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        assigneeId: 'outsider',
      },
      list: null,
      assigneeInOrganization: false,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('ASSIGNEE_NOT_IN_ORGANIZATION');
    }
  });
});
