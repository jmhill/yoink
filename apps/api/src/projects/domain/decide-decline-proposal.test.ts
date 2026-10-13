import { describe, it, expect } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import { decideDeclineProposal } from './decide-decline-proposal.js';

const proposed = (): Project => ({
  id: 'project-1',
  organizationId: 'org-123',
  createdById: 'user-lane',
  name: 'Harbor shed',
  status: 'proposed',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: '2026-10-13T12:00:00.000Z',
  lastChangedAt: '2026-10-13T12:00:00.000Z',
  lastChangedBy: 'user-lane',
});

describe('decideDeclineProposal', () => {
  it('sets declined', () => {
    const result = decideDeclineProposal({
      project: proposed(),
      command: {
        id: 'project-1',
        organizationId: 'org-123',
        actor: { kind: 'user', userId: 'user-justin', via: 'session' },
      },
      now: '2026-10-13T13:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.to).toBe('declined');
      expect(result.value.from).toBe('proposed');
    }
  });

  it('refuses a bot', () => {
    const result = decideDeclineProposal({
      project: proposed(),
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
      now: '2026-10-13T13:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_DECLINE_REQUIRES_PERSON');
    }
  });

  it('refuses when already confirmed', () => {
    const result = decideDeclineProposal({
      project: { ...proposed(), status: 'active' },
      command: {
        id: 'project-1',
        organizationId: 'org-123',
        actor: { kind: 'user', userId: 'user-justin', via: 'session' },
      },
      now: '2026-10-13T13:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_NOT_PROPOSED');
    }
  });
});
