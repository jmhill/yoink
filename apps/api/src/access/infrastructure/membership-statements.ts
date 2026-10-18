import type {
  MembershipRole,
  OrganizationMembership,
} from '../domain/organization-membership.js';
import type { Organization } from '../domain/organization.js';
import type { User } from '../domain/user.js';
import type { OwnershipTransferPlan } from '../domain/owner-presence.js';

const membershipRoleOf = (value: unknown): MembershipRole | null => {
  if (value === 'owner' || value === 'admin' || value === 'member') {
    return value;
  }
  return null;
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

export const membershipFromRow = (
  row: Record<string, unknown>
): OrganizationMembership | null => {
  const id = asString(row.id);
  const userId = asString(row.user_id);
  const organizationId = asString(row.organization_id);
  const role = membershipRoleOf(row.role);
  const joinedAt = asString(row.joined_at);
  const personalFlag = asNumber(row.is_personal_org);
  if (!id || !userId || !organizationId || !role || !joinedAt || personalFlag === null) {
    return null;
  }
  return {
    id,
    userId,
    organizationId,
    role,
    isPersonalOrg: personalFlag === 1,
    joinedAt,
  };
};

export const organizationInsertQuery = (organization: Organization) => ({
  sql: `
    INSERT INTO organizations (id, name, created_at)
    VALUES (?, ?, ?)
  `,
  args: [organization.id, organization.name, organization.createdAt],
});

export const userInsertQuery = (user: User) => ({
  sql: `
    INSERT INTO users (id, email, name, kind, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
  args: [user.id, user.email, user.name ?? null, user.kind ?? 'human', user.createdAt],
});

export const membershipInsertQuery = (membership: OrganizationMembership) => ({
  sql: `
    INSERT INTO organization_memberships (
      id, user_id, organization_id, role, is_personal_org, joined_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `,
  args: [
    membership.id,
    membership.userId,
    membership.organizationId,
    membership.role,
    membership.isPersonalOrg ? 1 : 0,
    membership.joinedAt,
  ],
});

export const membershipRoleUpdateQuery = (membership: OrganizationMembership) => ({
  sql: `UPDATE organization_memberships SET role = ? WHERE id = ?`,
  args: [membership.role, membership.id],
});

export const planQueries = ({ demote, promote }: OwnershipTransferPlan) => [
  ...(demote ? [membershipRoleUpdateQuery(demote)] : []),
  membershipRoleUpdateQuery(promote),
];
