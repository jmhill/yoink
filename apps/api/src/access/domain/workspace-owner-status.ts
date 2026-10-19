import { err, ok, Result } from 'neverthrow';
import { z } from 'zod';
import type { Organization } from './organization.js';
import type { Invitation } from './invitation.js';
import { invitationStatus } from './invitation.js';

export type ListWorkspaces = {
  type: 'ListWorkspaces';
};

export type WorkspaceOwnershipRow = {
  id: unknown;
  name: unknown;
  createdAt: unknown;
  ownerUserId: unknown;
  personal: unknown;
  liveOwnerInviteEmail: unknown;
  liveOwnerInviteExpiresAt: unknown;
};

export type WorkspaceOwnerStatus =
  | { kind: 'has-owner'; ownerUserId: string }
  | { kind: 'waiting-for-owner'; email: string; expiresAt: string }
  | {
      kind: 'no-owner';
      expiredInvite: { email: string; expiredAt: string } | null;
    };

export type WorkspaceSummary = {
  organization: Organization;
  personal: boolean;
  ownerStatus: WorkspaceOwnerStatus;
};

export type WorkspaceRowInvalid = {
  type: 'WORKSPACE_ROW_INVALID';
  organizationId: string | null;
  reason: string;
};

export type ListWorkspacesDecisionError = WorkspaceRowInvalid;

export const workspaceRowInvalid = (
  organizationId: string | null,
  reason: string
): WorkspaceRowInvalid => ({
  type: 'WORKSPACE_ROW_INVALID',
  organizationId,
  reason,
});

const WorkspaceRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  ownerUserId: z.union([z.string().uuid(), z.null()]).optional(),
  personal: z.union([z.boolean(), z.literal(0), z.literal(1)]),
  liveOwnerInviteEmail: z.union([z.string(), z.null()]).optional(),
  liveOwnerInviteExpiresAt: z.union([z.string(), z.null()]).optional(),
});

const rowOrganizationId = (row: WorkspaceOwnershipRow): string | null =>
  typeof row.id === 'string' ? row.id : null;

const isPresent = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value !== '';

const parseLiveInvite = (
  organizationId: string,
  email: string | null,
  expiresAt: string | null
): Result<{ email: string; expiresAt: string } | null, WorkspaceRowInvalid> => {
  const hasEmail = isPresent(email);
  const hasExpiry = isPresent(expiresAt);
  if (hasEmail !== hasExpiry) {
    return err(
      workspaceRowInvalid(
        organizationId,
        'owner invite email and expiry must both be set or both be empty'
      )
    );
  }
  if (!hasEmail || !hasExpiry) {
    return ok(null);
  }
  const emailParsed = z.string().email().safeParse(email);
  const expiryParsed = z.string().datetime().safeParse(expiresAt);
  if (!emailParsed.success || !expiryParsed.success) {
    return err(workspaceRowInvalid(organizationId, 'owner invite email or expiry is invalid'));
  }
  return ok({ email: emailParsed.data, expiresAt: expiryParsed.data });
};

const liveInviteView = (input: {
  email: string;
  expiresAt: string;
  organizationId: string;
  createdAt: string;
}): Invitation => ({
  id: input.organizationId,
  code: 'STATUS01',
  email: input.email,
  organizationId: input.organizationId,
  invitedByUserId: null,
  role: 'owner',
  expiresAt: input.expiresAt,
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: input.createdAt,
});

const ownershipFromUnknown = (row: Record<string, unknown>): WorkspaceOwnershipRow => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt,
  ownerUserId: row.ownerUserId,
  personal: row.personal,
  liveOwnerInviteEmail: row.liveOwnerInviteEmail,
  liveOwnerInviteExpiresAt: row.liveOwnerInviteExpiresAt,
});

export const decideWorkspaceSummary = ({
  row,
  now,
}: {
  row: WorkspaceOwnershipRow;
  now: string;
}): Result<WorkspaceSummary, WorkspaceRowInvalid> => {
  const parsed = WorkspaceRowSchema.safeParse(row);
  if (!parsed.success) {
    return err(
      workspaceRowInvalid(rowOrganizationId(row), parsed.error.issues[0]?.message ?? 'invalid row')
    );
  }

  const liveInvite = parseLiveInvite(
    parsed.data.id,
    parsed.data.liveOwnerInviteEmail ?? null,
    parsed.data.liveOwnerInviteExpiresAt ?? null
  );
  if (liveInvite.isErr()) {
    return err(liveInvite.error);
  }

  const personal = parsed.data.personal === true || parsed.data.personal === 1;
  const organization: Organization = {
    id: parsed.data.id,
    name: parsed.data.name,
    createdAt: parsed.data.createdAt,
  };

  if (parsed.data.ownerUserId) {
    return ok({
      organization,
      personal,
      ownerStatus: { kind: 'has-owner', ownerUserId: parsed.data.ownerUserId },
    });
  }

  if (liveInvite.value) {
    const invite = liveInvite.value;
    const status = invitationStatus(
      liveInviteView({
        email: invite.email,
        expiresAt: invite.expiresAt,
        organizationId: parsed.data.id,
        createdAt: parsed.data.createdAt,
      }),
      now
    );
    if (status === 'pending') {
      return ok({
        organization,
        personal,
        ownerStatus: {
          kind: 'waiting-for-owner',
          email: invite.email,
          expiresAt: invite.expiresAt,
        },
      });
    }
    return ok({
      organization,
      personal,
      ownerStatus: {
        kind: 'no-owner',
        expiredInvite: { email: invite.email, expiredAt: invite.expiresAt },
      },
    });
  }

  return ok({
    organization,
    personal,
    ownerStatus: { kind: 'no-owner', expiredInvite: null },
  });
};

export const decideListWorkspaces = ({
  query,
  rows,
  now,
}: {
  query: ListWorkspaces;
  rows: readonly Record<string, unknown>[];
  now: string;
}): Result<readonly WorkspaceSummary[], ListWorkspacesDecisionError> => {
  void query;
  return Result.combine(
    rows.map((row) => decideWorkspaceSummary({ row: ownershipFromUnknown(row), now }))
  );
};

export const needsOwnerBadge = (
  summary: WorkspaceSummary
): 'no-owner' | 'waiting-for-owner' | null => {
  if (summary.personal) {
    return null;
  }
  switch (summary.ownerStatus.kind) {
    case 'has-owner':
      return null;
    case 'waiting-for-owner':
      return 'waiting-for-owner';
    case 'no-owner':
      return 'no-owner';
    default: {
      const _never: never = summary.ownerStatus;
      return _never;
    }
  }
};
