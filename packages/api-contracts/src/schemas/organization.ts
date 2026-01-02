import { z } from 'zod';

// ============================================================================
// Member Role
// ============================================================================

export const MembershipRoleSchema = z.enum(['owner', 'admin', 'member']);

export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

// ============================================================================
// Member
// ============================================================================

/**
 * A member of an organization.
 */
export const MemberSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  role: MembershipRoleSchema,
  joinedAt: z.string().datetime(),
});

export type Member = z.infer<typeof MemberSchema>;

/**
 * Response for listing organization members.
 */
export const ListMembersResponseSchema = z.object({
  members: z.array(MemberSchema),
});

export type ListMembersResponse = z.infer<typeof ListMembersResponseSchema>;

// ============================================================================
// Switch Organization
// ============================================================================

/**
 * Request to switch the current organization for a session.
 */
export const SwitchOrganizationRequestSchema = z.object({
  organizationId: z.string().uuid(),
});

export type SwitchOrganizationRequest = z.infer<typeof SwitchOrganizationRequestSchema>;

/**
 * Response after successfully switching organizations.
 */
export const SwitchOrganizationResponseSchema = z.object({
  success: z.literal(true),
});

export type SwitchOrganizationResponse = z.infer<typeof SwitchOrganizationResponseSchema>;

// ============================================================================
// Leave Organization
// ============================================================================

/**
 * Response after successfully leaving an organization.
 */
export const LeaveOrganizationResponseSchema = z.object({
  success: z.literal(true),
});

export type LeaveOrganizationResponse = z.infer<typeof LeaveOrganizationResponseSchema>;
