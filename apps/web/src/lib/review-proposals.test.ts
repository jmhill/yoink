import { describe, expect, it } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import { proposedProjectsByName } from './review-proposals';

const project = (name: string, status: Project['status']): Project => ({
  id: `00000000-0000-0000-0000-0000000000${name.length.toString(16).padStart(2, '0')}`,
  organizationId: '00000000-0000-0000-0000-000000000001',
  name,
  status,
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdById: '00000000-0000-0000-0000-000000000002',
  createdAt: '2026-10-13T12:00:00.000Z',
  lastChangedAt: null,
  lastChangedBy: null,
});

describe('proposedProjectsByName', () => {
  it('keeps proposed projects and sorts them by name', () => {
    const listed = proposedProjectsByName([
      project('roles and ownership cleanup', 'proposed'),
      project('Garden', 'active'),
      project('gun storage', 'proposed'),
      project('Old', 'declined'),
    ]);

    expect(listed.map((item) => item.name)).toEqual([
      'gun storage',
      'roles and ownership cleanup',
    ]);
  });

  it('is empty when nothing is proposed', () => {
    expect(proposedProjectsByName([project('Garden', 'active')])).toEqual([]);
  });
});
