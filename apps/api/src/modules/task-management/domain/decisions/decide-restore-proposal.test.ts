import { describe, it, expect } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import { decideRestoreProposal } from './decide-restore-proposal.js';

const declined = (): Project => ({
  id: 'project-1',
  organizationId: 'org-123',
  createdById: 'user-lane',
  name: 'Harbor shed',
  status: 'declined',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: '2026-10-13T12:00:00.000Z',
  lastChangedAt: '2026-10-13T13:00:00.000Z',
  lastChangedBy: 'user-justin',
});

describe('decideRestoreProposal', () => {
  it('restores to proposed when the name is still free', () => {
    const result = decideRestoreProposal({
      project: declined(),
      command: {
        id: 'project-1',
        organizationId: 'org-123',
        actor: { kind: 'user', userId: 'user-justin', via: 'session' },
      },
      existingNames: [],
      now: '2026-10-13T14:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.from).toBe('declined');
      expect(result.value.to).toBe('proposed');
    }
  });

  it('refuses when another project took the name', () => {
    const result = decideRestoreProposal({
      project: declined(),
      command: {
        id: 'project-1',
        organizationId: 'org-123',
        actor: { kind: 'user', userId: 'user-justin', via: 'session' },
      },
      existingNames: ['Harbor shed'],
      now: '2026-10-13T14:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_PROJECT_NAME');
    }
  });

  it('refuses a bot', () => {
    const result = decideRestoreProposal({
      project: declined(),
      command: {
        id: 'project-1',
        organizationId: 'org-123',
        actor: {
          kind: 'bot',
          userId: 'user-lane',
          tokenId: 'tok',
          name: 'Lane',
          via: 'token',
        },
      },
      existingNames: [],
      now: '2026-10-13T14:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_RESTORE_REQUIRES_PERSON');
    }
  });
});
