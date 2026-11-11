import { describe, expect, it } from 'vitest';
import { toContractAdminProject, toContractMember, toContractMemberTransfer } from './map-access-document.js';

const member = {
  userId: '550e8400-e29b-41d4-a716-446655440010',
  email: 'libby@example.com',
  name: 'Libby',
  kind: 'human' as const,
  role: 'admin' as const,
  joinedAt: '2024-06-15T12:00:00.000Z',
};

describe('map access documents', () => {
  it('copies a changed member onto the contract member', () => {
    expect(toContractMember(member)).toEqual({
      userId: member.userId,
      email: member.email,
      name: member.name,
      kind: 'human',
      role: 'admin',
      joinedAt: member.joinedAt,
    });
  });

  it('copies a listed member and a handover onto the contract types', () => {
    const listed = toContractMember({
      ...member,
      role: 'member',
      name: undefined,
    });
    expect(listed.role).toBe('member');
    expect(listed.name).toBeUndefined();

    const transfer = toContractMemberTransfer({
      owner: { ...member, role: 'owner' },
      previousOwner: { ...member, role: 'admin', userId: '550e8400-e29b-41d4-a716-446655440011' },
    });
    expect(transfer.owner.role).toBe('owner');
    expect(transfer.previousOwner.role).toBe('admin');
  });

  it('copies the admin project document onto the contract project', () => {
    const project = toContractAdminProject({
      id: '550e8400-e29b-41d4-a716-446655440020',
      organizationId: '550e8400-e29b-41d4-a716-446655440001',
      createdById: member.userId,
      name: 'Shed',
      status: 'active',
      waitingOn: null,
      waitingSince: null,
      nextActionTaskId: null,
      notebookPages: [],
      createdAt: '2024-01-02T00:00:00.000Z',
      lastChangedAt: null,
      lastChangedBy: null,
    });
    expect(project).toMatchObject({
      id: '550e8400-e29b-41d4-a716-446655440020',
      name: 'Shed',
      createdAt: '2024-01-02T00:00:00.000Z',
    });
    expect(project.objective).toBeUndefined();
  });
});
