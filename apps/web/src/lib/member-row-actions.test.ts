import { describe, expect, it } from 'vitest';
import type { Member } from '@yoink/api-contracts';
import {
  canChangeRole,
  canReissue,
  canRemove,
  roleActionFor,
  type MemberRowViewer,
} from './member-row-actions';

const member = (overrides: Partial<Member> = {}): Member => ({
  userId: 'member-1',
  email: 'libby@example.com',
  name: 'Libby',
  kind: 'human',
  role: 'member',
  joinedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const ownerViewer: MemberRowViewer = { userId: 'justin', role: 'owner' };
const adminViewer: MemberRowViewer = { userId: 'polly', role: 'admin' };
const memberViewer: MemberRowViewer = { userId: 'libby', role: 'member' };

describe('canChangeRole', () => {
  it('lets the owner and an admin change another human who is not the owner', () => {
    expect(canChangeRole(ownerViewer, member())).toBe(true);
    expect(canChangeRole(adminViewer, member())).toBe(true);
    expect(canChangeRole(adminViewer, member({ userId: 'pat', role: 'admin' }))).toBe(true);
  });

  it('hides the control on the owner, the viewer, a bot, and for a member viewer', () => {
    expect(canChangeRole(adminViewer, member({ userId: 'justin', role: 'owner' }))).toBe(false);
    expect(canChangeRole(adminViewer, member({ userId: 'polly', role: 'admin' }))).toBe(false);
    expect(canChangeRole(ownerViewer, member({ userId: 'justin', role: 'owner' }))).toBe(false);
    expect(canChangeRole(adminViewer, member({ kind: 'agent', name: 'Lane' }))).toBe(false);
    expect(canChangeRole(memberViewer, member({ userId: 'pat' }))).toBe(false);
  });
});

describe('roleActionFor', () => {
  it('offers only the other role', () => {
    expect(roleActionFor(member())).toBe('admin');
    expect(roleActionFor(member({ role: 'admin' }))).toBe('member');
    expect(roleActionFor(member({ role: 'owner' }))).toBe(null);
  });
});

describe('canRemove', () => {
  it('lets an admin remove another admin and a member', () => {
    expect(canRemove(adminViewer, member({ userId: 'pat', role: 'admin' }))).toBe(true);
    expect(canRemove(adminViewer, member())).toBe(true);
    expect(canRemove(ownerViewer, member({ userId: 'pat', role: 'admin' }))).toBe(true);
  });

  it('hides remove on the owner, the viewer, and for a member viewer', () => {
    expect(canRemove(adminViewer, member({ userId: 'justin', role: 'owner' }))).toBe(false);
    expect(canRemove(adminViewer, member({ userId: 'polly', role: 'admin' }))).toBe(false);
    expect(canRemove(memberViewer, member({ userId: 'pat' }))).toBe(false);
  });
});

describe('canReissue', () => {
  it('lets the owner and an admin reissue a bot token', () => {
    const bot = member({ kind: 'agent', name: 'Lane' });
    expect(canReissue(ownerViewer, bot)).toBe(true);
    expect(canReissue(adminViewer, bot)).toBe(true);
    expect(canReissue(memberViewer, bot)).toBe(false);
    expect(canReissue(adminViewer, member())).toBe(false);
  });
});
