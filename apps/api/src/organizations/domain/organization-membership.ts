import { z } from 'zod';

/**
 * Membership role in an organization.
 * - owner: Full control, only for personal orgs, cannot be removed
 * - admin: Can invite/remove members, manage org settings
 * - member: Can create/manage their own captures and tasks
 */
export const MembershipRoleSchema = z.enum(['owner', 'admin', 'member']);

export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

/**
 * Represents a user's membership in an organization.
 *
 * This is a many-to-many relationship between users and organizations.
 * A user can belong to multiple organizations, and an organization can have
 * multiple members.
 */
export const OrganizationMembershipSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  role: MembershipRoleSchema,
  /** True if this is the user's personal org (auto-created, cannot leave) */
  isPersonalOrg: z.boolean(),
  joinedAt: z.string().datetime(),
});

export type OrganizationMembership = z.infer<typeof OrganizationMembershipSchema>;
