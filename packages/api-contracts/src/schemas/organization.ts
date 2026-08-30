import { z } from 'zod';
import { TokenInfoSchema } from './token.js';

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
export const PrincipalKindSchema = z.enum(['human', 'agent']);

export type PrincipalKind = z.infer<typeof PrincipalKindSchema>;

export const MemberSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().optional(),
  kind: PrincipalKindSchema.default('human'),
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

// ============================================================================
// Agents
// ============================================================================

export const CreateAgentRequestSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;

export const AgentInfoSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  kind: z.literal('agent'),
  role: MembershipRoleSchema,
});

export type AgentInfo = z.infer<typeof AgentInfoSchema>;

export const CreateAgentResponseSchema = z.object({
  agent: AgentInfoSchema,
  token: TokenInfoSchema,
  rawToken: z.string(),
});

export type CreateAgentResponse = z.infer<typeof CreateAgentResponseSchema>;
