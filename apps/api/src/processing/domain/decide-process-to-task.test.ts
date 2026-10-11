import { describe, expect, it } from 'vitest';
import type { Capture } from '@yoink/api-contracts';
import type { ProcessCaptureToTaskCommand } from '../../captures/domain/capture-commands.js';
import { decideProcessCaptureToTask } from './decide-process-to-task.js';

const inboxCapture = (overrides: Partial<Capture> = {}): Capture => ({
  id: 'cap-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  content: 'Buy milk',
  status: 'inbox',
  capturedAt: '2026-09-12T02:40:00.000Z',
  ...overrides,
});

const command = (
  overrides: Partial<ProcessCaptureToTaskCommand> = {}
): ProcessCaptureToTaskCommand => ({
  id: 'cap-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  actor: { kind: 'user', userId: 'user-1', via: 'session' },
  ...overrides,
});

describe('decideProcessCaptureToTask', () => {
  it('defaults the title from the capture and marks it processed to the task', () => {
    const result = decideProcessCaptureToTask({
      command: command(),
      capture: inboxCapture(),
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      id: 'task-1',
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.taskCreated.title).toBe('Buy milk');
      expect(result.value.taskCreated.captureId).toBe('cap-1');
      expect(result.value.captureProcessed).toEqual({
        type: 'CaptureProcessed',
        id: 'cap-1',
        organizationId: 'org-1',
        processedAt: '2026-10-11T18:00:00.000Z',
        processedToType: 'task',
        processedToId: 'task-1',
        occurredAt: '2026-10-11T18:00:00.000Z',
      });
    }
  });

  it('truncates a long capture to 100 characters for the default title', () => {
    const result = decideProcessCaptureToTask({
      command: command(),
      capture: inboxCapture({ content: 'A'.repeat(200) }),
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      id: 'task-1',
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.taskCreated.title).toBe('A'.repeat(100));
    }
  });

  it('uses a provided title, due date, list, and project without mutating the command', () => {
    const input = command({
      title: 'Custom',
      dueDate: '2026-10-20',
      listId: 'list-1',
      projectId: 'proj-1',
    });
    const frozen = { ...input };
    const result = decideProcessCaptureToTask({
      command: input,
      capture: inboxCapture(),
      list: { id: 'list-1', organizationId: 'org-1' },
      project: { id: 'proj-1', organizationId: 'org-1', status: 'active', nextActionTaskId: null },
      assigneeInOrganization: null,
      nextOpenOrder: 3,
      id: 'task-1',
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.taskCreated.title).toBe('Custom');
      expect(result.value.taskCreated.dueDate).toBe('2026-10-20');
      expect(result.value.taskCreated.listId).toBe('list-1');
      expect(result.value.taskCreated.projectId).toBe('proj-1');
      expect(result.value.taskCreated.openOrder).toBe(3);
    }
    expect(input).toEqual(frozen);
  });

  it('rejects a missing capture', () => {
    const result = decideProcessCaptureToTask({
      command: command(),
      capture: null,
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      id: 'task-1',
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
    }
  });

  it('rejects a capture that is not in the inbox', () => {
    const result = decideProcessCaptureToTask({
      command: command(),
      capture: inboxCapture({ status: 'processed', processedToType: 'task', processedToId: 't' }),
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      id: 'task-1',
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
  });

  it('lets a bot actor process to a task', () => {
    const result = decideProcessCaptureToTask({
      command: command({
        actor: { kind: 'bot', userId: 'user-lane', tokenId: 'tok-lane', name: 'Lane', via: 'token' },
      }),
      capture: inboxCapture(),
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      id: 'task-1',
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
  });
});
