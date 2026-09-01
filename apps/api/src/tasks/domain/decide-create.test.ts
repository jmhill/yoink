import { describe, it, expect } from 'vitest';
import { decideCreateTask } from './decide-create.js';

const command = {
  title: 'Buy milk',
  organizationId: 'org-123',
  createdById: 'user-456',
};

const groceries = { id: 'list-groceries', organizationId: 'org-123' };
const otherOrgList = { id: 'list-other', organizationId: 'org-other' };

describe('decideCreateTask', () => {
  it('creates an unlisted open task when no list is given', () => {
    const result = decideCreateTask({
      command,
      list: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      id: 'task-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'TaskCreated',
        id: 'task-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Buy milk',
        dueDate: undefined,
        captureId: undefined,
        assigneeId: undefined,
        listId: undefined,
        openOrder: 0,
        createdAt: '2025-01-15T10:00:00.000Z',
      });
    }
  });

  it('creates a new task already on a named list in the same organization', () => {
    const result = decideCreateTask({
      command: { ...command, listId: groceries.id },
      list: groceries,
      assigneeInOrganization: null,
      nextOpenOrder: 2,
      id: 'task-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.listId).toBe('list-groceries');
      expect(result.value.openOrder).toBe(2);
      expect(result.value.type).toBe('TaskCreated');
    }
  });

  it('appends a new unlisted task at the end of the unlisted open pile', () => {
    const result = decideCreateTask({
      command,
      list: null,
      assigneeInOrganization: null,
      nextOpenOrder: 4,
      id: 'task-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.listId).toBeUndefined();
      expect(result.value.openOrder).toBe(4);
    }
  });

  it('appends a new listed task at the end of that list’s open tasks', () => {
    const result = decideCreateTask({
      command: { ...command, listId: groceries.id },
      list: groceries,
      assigneeInOrganization: null,
      nextOpenOrder: 3,
      id: 'task-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.openOrder).toBe(3);
    }
  });

  it('does not mark a new task completed — new tasks are open', () => {
    const result = decideCreateTask({
      command: { ...command, listId: groceries.id },
      list: groceries,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      id: 'task-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).not.toHaveProperty('completedAt');
    }
  });

  it('rejects an unknown list', () => {
    const result = decideCreateTask({
      command: { ...command, listId: 'list-missing' },
      list: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      id: 'task-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
  });

  it('rejects a list from another organization', () => {
    const result = decideCreateTask({
      command: { ...command, listId: otherOrgList.id },
      list: otherOrgList,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      id: 'task-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
  });

  it('includes optional due date, assignee, and capture when provided', () => {
    const result = decideCreateTask({
      command: {
        ...command,
        dueDate: '2025-01-20',
        assigneeId: 'user-456',
        captureId: 'capture-789',
        listId: groceries.id,
      },
      list: groceries,
      assigneeInOrganization: true,
      nextOpenOrder: 0,
      id: 'task-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.dueDate).toBe('2025-01-20');
      expect(result.value.assigneeId).toBe('user-456');
      expect(result.value.captureId).toBe('capture-789');
      expect(result.value.listId).toBe('list-groceries');
    }
  });

  it('rejects an assignee who is not in the organization', () => {
    const result = decideCreateTask({
      command: { ...command, assigneeId: 'outsider' },
      list: null,
      assigneeInOrganization: false,
      nextOpenOrder: 0,
      id: 'task-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('ASSIGNEE_NOT_IN_ORGANIZATION');
    }
  });
});
