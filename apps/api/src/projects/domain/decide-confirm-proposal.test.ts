import { describe, it, expect } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import { decideConfirmProposal } from './decide-confirm-proposal.js';
import type { ConfirmProposedProjectCommand } from './project-commands.js';

const proposed = (): Project => ({
  id: 'project-1',
  organizationId: 'org-123',
  createdById: 'user-lane',
  name: 'Harbor shed',
  objective: 'Keep the dock usable',
  status: 'proposed',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  reason: 'Dock needs work',
  suggestedNextAction: 'Call the mill',
  createdAt: '2026-10-13T12:00:00.000Z',
  lastChangedAt: '2026-10-13T12:00:00.000Z',
  lastChangedBy: 'user-lane',
});

const person = (
  overrides: Partial<ConfirmProposedProjectCommand> = {}
): ConfirmProposedProjectCommand => ({
  id: 'project-1',
  organizationId: 'org-123',
  actor: { kind: 'user', userId: 'user-justin', via: 'session' },
  ...overrides,
});

describe('decideConfirmProposal', () => {
  it('confirms as active and keeps the suggested next action', () => {
    const result = decideConfirmProposal({
      project: proposed(),
      command: person(),
      existingNames: ['Harbor shed'],
      now: '2026-10-13T13:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.updated).toBeNull();
      expect(result.value.statusChanged.to).toBe('active');
      expect(result.value.statusChanged.from).toBe('proposed');
      expect(result.value.suggestedNextAction).toBe('Call the mill');
    }
  });

  it('lets Justin rename and confirm as someday', () => {
    const result = decideConfirmProposal({
      project: proposed(),
      command: person({ name: 'Dock rebuild', status: 'someday' }),
      existingNames: ['Harbor shed'],
      now: '2026-10-13T13:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.updated?.name).toBe('Dock rebuild');
      expect(result.value.statusChanged.to).toBe('someday');
    }
  });

  it('clears the suggested next action when Justin sends empty', () => {
    const result = decideConfirmProposal({
      project: proposed(),
      command: person({ suggestedNextAction: '  ' }),
      existingNames: ['Harbor shed'],
      now: '2026-10-13T13:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.suggestedNextAction).toBeUndefined();
      expect(result.value.updated?.suggestedNextAction).toBeNull();
    }
  });

  it('requires waiting on when confirming as waiting', () => {
    const result = decideConfirmProposal({
      project: proposed(),
      command: person({ status: 'waiting' }),
      existingNames: ['Harbor shed'],
      now: '2026-10-13T13:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_WAITING_ON_REQUIRED');
    }
  });

  it('refuses a bot', () => {
    const result = decideConfirmProposal({
      project: proposed(),
      command: {
        ...person(),
        actor: {
          kind: 'bot',
          userId: 'user-lane',
          tokenId: 'tok',
          name: 'Lane',
          via: 'token',
        },
      },
      existingNames: ['Harbor shed'],
      now: '2026-10-13T13:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_CONFIRM_REQUIRES_PERSON');
    }
  });

  it('refuses a project that is not proposed', () => {
    const result = decideConfirmProposal({
      project: { ...proposed(), status: 'active' },
      command: person(),
      existingNames: ['Harbor shed'],
      now: '2026-10-13T13:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_NOT_PROPOSED');
    }
  });
});
