import { describe, expect, it } from 'vitest';
import type { Capture } from '@yoink/api-contracts';
import type { ProcessCaptureToProjectCommand } from '../../captures/domain/capture-commands.js';
import { decideProcessCaptureToProject } from './decide-process-to-project.js';

const inboxCapture = (): Capture => ({
  id: 'cap-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  content: 'Harbor shed',
  status: 'inbox',
  capturedAt: '2026-09-12T02:40:00.000Z',
});

const personCommand = (
  overrides: Partial<ProcessCaptureToProjectCommand> = {}
): ProcessCaptureToProjectCommand => ({
  id: 'cap-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  name: 'Harbor',
  status: 'active',
  actor: { kind: 'user', userId: 'user-1', via: 'session' },
  ...overrides,
});

describe('decideProcessCaptureToProject', () => {
  it('creates an active project from an inbox capture', () => {
    const command = personCommand({ objective: '  Fix the door  ' });
    const result = decideProcessCaptureToProject({
      command,
      capture: inboxCapture(),
      existingNames: [],
      ids: { projectId: 'proj-1' },
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.projectCreated).toEqual({
        type: 'ProjectCreated',
        id: 'proj-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        name: 'Harbor',
        objective: 'Fix the door',
        status: 'active',
        captureId: 'cap-1',
        createdAt: '2026-10-11T18:00:00.000Z',
        occurredAt: '2026-10-11T18:00:00.000Z',
      });
      expect(result.value.captureProcessed).toEqual({
        type: 'CaptureProcessed',
        id: 'cap-1',
        organizationId: 'org-1',
        processedAt: '2026-10-11T18:00:00.000Z',
        processedToType: 'project',
        processedToId: 'proj-1',
        occurredAt: '2026-10-11T18:00:00.000Z',
      });
    }
  });

  it('creates a someday project without a second status-change fact', () => {
    const result = decideProcessCaptureToProject({
      command: personCommand({ status: 'someday' }),
      capture: inboxCapture(),
      existingNames: [],
      ids: { projectId: 'proj-1' },
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.projectCreated.status).toBe('someday');
    }
  });

  it('rejects a blank name', () => {
    const result = decideProcessCaptureToProject({
      command: personCommand({ name: '   ' }),
      capture: inboxCapture(),
      existingNames: [],
      ids: { projectId: 'proj-1' },
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_NAME_BLANK');
    }
  });

  it('rejects a duplicate name', () => {
    const result = decideProcessCaptureToProject({
      command: personCommand({ name: 'Garden' }),
      capture: inboxCapture(),
      existingNames: ['Garden'],
      ids: { projectId: 'proj-1' },
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_PROJECT_NAME');
    }
  });

  it('rejects a capture that is not in the inbox', () => {
    const result = decideProcessCaptureToProject({
      command: personCommand(),
      capture: { ...inboxCapture(), status: 'trashed', trashedAt: '2026-10-11T12:00:00.000Z' },
      existingNames: [],
      ids: { projectId: 'proj-1' },
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_INBOX');
    }
  });

  it('hides a capture from another organization', () => {
    const result = decideProcessCaptureToProject({
      command: personCommand(),
      capture: { ...inboxCapture(), organizationId: 'org-other' },
      existingNames: [],
      ids: { projectId: 'proj-1' },
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
    }
  });

  it('refuses a bot actor and writes nothing', () => {
    const result = decideProcessCaptureToProject({
      command: personCommand({
        actor: { kind: 'bot', userId: 'user-lane', tokenId: 'tok-lane', name: 'Lane', via: 'token' },
      }),
      capture: inboxCapture(),
      existingNames: [],
      ids: { projectId: 'proj-1' },
      now: '2026-10-11T18:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_CREATE_REQUIRES_PERSON');
    }
  });

  it('does not mutate the command', () => {
    const command = personCommand({ objective: '  keep  ' });
    const frozen = { ...command };
    decideProcessCaptureToProject({
      command,
      capture: inboxCapture(),
      existingNames: [],
      ids: { projectId: 'proj-1' },
      now: '2026-10-11T18:00:00.000Z',
    });
    expect(command).toEqual(frozen);
  });
});
