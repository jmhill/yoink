import { describe, it, expect } from 'vitest';
import { canManageOrgToken } from './can-manage-token.js';

describe('canManageOrgToken', () => {
  it('allows a member to manage their own token', () => {
    expect(
      canManageOrgToken({
        actorUserId: 'justin',
        actorRole: 'member',
        tokenUserId: 'justin',
        tokenOwnerKind: 'human',
      })
    ).toBe(true);
  });

  it('refuses a member managing an agent token', () => {
    expect(
      canManageOrgToken({
        actorUserId: 'justin',
        actorRole: 'member',
        tokenUserId: 'lane',
        tokenOwnerKind: 'agent',
      })
    ).toBe(false);
  });

  it('allows an owner to manage an agent token', () => {
    expect(
      canManageOrgToken({
        actorUserId: 'justin',
        actorRole: 'owner',
        tokenUserId: 'lane',
        tokenOwnerKind: 'agent',
      })
    ).toBe(true);
  });

  it('allows an admin to manage an agent token', () => {
    expect(
      canManageOrgToken({
        actorUserId: 'polly',
        actorRole: 'admin',
        tokenUserId: 'lane',
        tokenOwnerKind: 'agent',
      })
    ).toBe(true);
  });

  it('refuses an owner managing another human token', () => {
    expect(
      canManageOrgToken({
        actorUserId: 'justin',
        actorRole: 'owner',
        tokenUserId: 'polly',
        tokenOwnerKind: 'human',
      })
    ).toBe(false);
  });
});
