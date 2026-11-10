import { describe, expect, it } from 'vitest';
import type { ProcessCaptureToTaskCommand } from './commands.js';
import { toTaskStarter } from './to-task-starter.js';

const command = (
  overrides: Partial<ProcessCaptureToTaskCommand> = {}
): ProcessCaptureToTaskCommand => ({
  id: 'cap-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  actor: { kind: 'user', userId: 'user-1', via: 'session' },
  ...overrides,
});

describe('toTaskStarter', () => {
  it('defaults the title from the capture and keeps the source id', () => {
    expect(toTaskStarter(command(), { id: 'cap-1', content: 'Buy milk' })).toEqual({
      title: 'Buy milk',
      organizationId: 'org-1',
      createdById: 'user-1',
      captureId: 'cap-1',
    });
  });

  it('cuts a long capture at 100 characters', () => {
    expect(toTaskStarter(command(), { id: 'cap-1', content: 'A'.repeat(200) }).title).toBe(
      'A'.repeat(100)
    );
  });

  it('uses a provided title, due date, list, and project without mutating the command', () => {
    const input = command({
      title: 'Custom',
      dueDate: '2026-10-20',
      listId: 'list-1',
      projectId: 'proj-1',
    });
    const frozen = { ...input };

    expect(toTaskStarter(input, { id: 'cap-1', content: 'Buy milk' })).toEqual({
      title: 'Custom',
      organizationId: 'org-1',
      createdById: 'user-1',
      captureId: 'cap-1',
      dueDate: '2026-10-20',
      listId: 'list-1',
      projectId: 'proj-1',
    });
    expect(input).toEqual(frozen);
  });
});
