import { describe, it, expect } from 'vitest';
import {
  decideListWorkspaces,
  decideWorkspaceSummary,
  needsOwnerBadge,
  type WorkspaceOwnershipRow,
  type WorkspaceSummary,
} from './workspace-owner-status.js';

const now = '2024-06-15T12:00:00.000Z';
const orgId = '550e8400-e29b-41d4-a716-446655440001';
const ownerUserId = '550e8400-e29b-41d4-a716-446655440010';

const row = (overrides: Partial<WorkspaceOwnershipRow> = {}): WorkspaceOwnershipRow => ({
  id: orgId,
  name: 'Garden Club',
  createdAt: '2024-01-01T00:00:00.000Z',
  ownerUserId: null,
  personal: false,
  liveOwnerInviteEmail: null,
  liveOwnerInviteExpiresAt: null,
  ...overrides,
});

const summaryOf = (overrides: Partial<WorkspaceOwnershipRow> = {}): WorkspaceSummary => {
  const result = decideWorkspaceSummary({ row: row(overrides), now });
  if (result.isErr()) {
    throw new Error(result.error.reason);
  }
  return result.value;
};

describe('decideWorkspaceSummary', () => {
  it('returns has-owner when the workspace has an owner', () => {
    const result = decideWorkspaceSummary({
      row: row({ ownerUserId }),
      now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.ownerStatus).toEqual({
        kind: 'has-owner',
        ownerUserId,
      });
      expect(result.value.organization.name).toBe('Garden Club');
      expect(result.value.personal).toBe(false);
    }
  });

  it('returns has-owner when an owner and a live invite both exist', () => {
    const result = decideWorkspaceSummary({
      row: row({
        ownerUserId,
        liveOwnerInviteEmail: 'libby@example.com',
        liveOwnerInviteExpiresAt: '2024-06-22T12:00:00.000Z',
      }),
      now,
    });
    expect(result.isOk() && result.value.ownerStatus).toEqual({
      kind: 'has-owner',
      ownerUserId,
    });
  });

  it('returns waiting-for-owner for a pending invite', () => {
    const result = decideWorkspaceSummary({
      row: row({
        liveOwnerInviteEmail: 'libby@example.com',
        liveOwnerInviteExpiresAt: '2024-06-22T12:00:00.000Z',
      }),
      now,
    });
    expect(result.isOk() && result.value.ownerStatus).toEqual({
      kind: 'waiting-for-owner',
      email: 'libby@example.com',
      expiresAt: '2024-06-22T12:00:00.000Z',
    });
  });

  it('returns no-owner with expiredInvite when the invite expires exactly at now', () => {
    const result = decideWorkspaceSummary({
      row: row({
        liveOwnerInviteEmail: 'libby@example.com',
        liveOwnerInviteExpiresAt: now,
      }),
      now,
    });
    expect(result.isOk() && result.value.ownerStatus).toEqual({
      kind: 'no-owner',
      expiredInvite: { email: 'libby@example.com', expiredAt: now },
    });
  });

  it('returns no-owner with expiredInvite null when there is no owner and no invite', () => {
    const result = decideWorkspaceSummary({ row: row(), now });
    expect(result.isOk() && result.value.ownerStatus).toEqual({
      kind: 'no-owner',
      expiredInvite: null,
    });
  });

  it('carries the personal flag through; personal ownerless status is no-owner', () => {
    const result = decideWorkspaceSummary({
      row: row({ personal: true }),
      now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.personal).toBe(true);
      expect(result.value.ownerStatus).toEqual({ kind: 'no-owner', expiredInvite: null });
      expect(needsOwnerBadge(result.value)).toBeNull();
    }
  });

  it('accepts SQLite 0/1 for the personal flag', () => {
    const personal = decideWorkspaceSummary({ row: row({ personal: 1 }), now });
    const notPersonal = decideWorkspaceSummary({ row: row({ personal: 0 }), now });
    expect(personal.isOk() && personal.value.personal).toBe(true);
    expect(notPersonal.isOk() && notPersonal.value.personal).toBe(false);
  });

  it('returns WORKSPACE_ROW_INVALID for a bad id', () => {
    const result = decideWorkspaceSummary({
      row: row({ id: 'not-a-uuid' }),
      now,
    });
    expect(result.isErr() && result.error).toEqual({
      type: 'WORKSPACE_ROW_INVALID',
      organizationId: 'not-a-uuid',
      reason: expect.any(String),
    });
  });

  it('returns WORKSPACE_ROW_INVALID for a bad datetime', () => {
    const result = decideWorkspaceSummary({
      row: row({ createdAt: 'yesterday' }),
      now,
    });
    expect(result.isErr() && result.error.type).toBe('WORKSPACE_ROW_INVALID');
    expect(result.isErr() && result.error.organizationId).toBe(orgId);
  });

  it('returns WORKSPACE_ROW_INVALID when an invite has email but no expiry', () => {
    const result = decideWorkspaceSummary({
      row: row({ liveOwnerInviteEmail: 'libby@example.com' }),
      now,
    });
    expect(result.isErr() && result.error).toMatchObject({
      type: 'WORKSPACE_ROW_INVALID',
      organizationId: orgId,
    });
  });
});

describe('decideListWorkspaces', () => {
  it('keeps the store order', () => {
    const firstId = orgId;
    const secondId = '550e8400-e29b-41d4-a716-446655440002';
    const result = decideListWorkspaces({
      query: { type: 'ListWorkspaces' },
      rows: [
        row({ id: firstId, name: 'Garden Club' }),
        row({ id: secondId, name: 'Harbor Shed' }),
      ],
      now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.map((summary) => summary.organization.name)).toEqual([
        'Garden Club',
        'Harbor Shed',
      ]);
    }
  });

  it('fails on the first bad row', () => {
    const result = decideListWorkspaces({
      query: { type: 'ListWorkspaces' },
      rows: [row(), row({ id: 'bad' }), row({ id: '550e8400-e29b-41d4-a716-446655440003' })],
      now,
    });
    expect(result.isErr() && result.error).toMatchObject({
      type: 'WORKSPACE_ROW_INVALID',
      organizationId: 'bad',
    });
  });
});

describe('needsOwnerBadge', () => {
  it('is no-owner for a non-personal workspace without an owner', () => {
    expect(needsOwnerBadge(summaryOf())).toBe('no-owner');
  });

  it('is waiting-for-owner for a non-personal pending invite', () => {
    expect(
      needsOwnerBadge(
        summaryOf({
          liveOwnerInviteEmail: 'libby@example.com',
          liveOwnerInviteExpiresAt: '2024-06-22T12:00:00.000Z',
        })
      )
    ).toBe('waiting-for-owner');
  });

  it('is null when the workspace has an owner', () => {
    expect(needsOwnerBadge(summaryOf({ ownerUserId }))).toBeNull();
  });

  it('is always null for a personal workspace', () => {
    expect(needsOwnerBadge(summaryOf({ personal: true }))).toBeNull();
    expect(needsOwnerBadge(summaryOf({ personal: true, ownerUserId }))).toBeNull();
    expect(
      needsOwnerBadge(
        summaryOf({
          personal: true,
          liveOwnerInviteEmail: 'libby@example.com',
          liveOwnerInviteExpiresAt: '2024-06-22T12:00:00.000Z',
        })
      )
    ).toBeNull();
  });
});
