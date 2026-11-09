import { describe, expect, it } from 'vitest';
import { createInMemoryUnitOfWork } from '../../../platform/unit-of-work/in-memory-unit-of-work.js';
import type { AdminPlan } from '../../domain/admin-plan.js';
import { createFakeAdminParticipant } from './fake-admin-participant.js';

const rename = (userId: string): AdminPlan => ({
  kind: 'rename-user',
  userId,
  name: 'Ada',
});

describe('fake admin participant', () => {
  it('reports Conflict for an unknown user and writes nothing', async () => {
    const state = { userIds: new Set<string>(), applied: [] };
    const unitOfWork = createInMemoryUnitOfWork({
      participants: [createFakeAdminParticipant(state)],
    });

    const result = await unitOfWork.commit([
      { result: null, events: [], step: { owner: 'access', plan: rename('missing') } },
    ]);

    expect(result.isErr() && result.error.kind).toBe('Conflict');
    if (result.isErr() && result.error.kind === 'Conflict') {
      expect(result.error.owner).toBe('access');
    }
    expect(state.applied).toEqual([]);
  });

  it('restores the snapshot when a later plan conflicts', async () => {
    const state = { userIds: new Set(['user-1']), applied: [] };
    const unitOfWork = createInMemoryUnitOfWork({
      participants: [createFakeAdminParticipant(state)],
    });
    const created: AdminPlan = {
      kind: 'create-organization',
      organization: {
        id: 'org-1',
        name: 'Polly',
        createdAt: '2024-06-15T12:00:00.000Z',
      },
    };

    const result = await unitOfWork.commit([
      { result: null, events: [], step: { owner: 'access', plan: created } },
      { result: null, events: [], step: { owner: 'access', plan: rename('missing') } },
    ]);

    expect(result.isErr() && result.error.kind).toBe('Conflict');
    expect(state.applied).toEqual([]);
    expect(state.userIds.has('user-1')).toBe(true);
  });
});
