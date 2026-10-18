import { z } from 'zod';
import { TokenInfoSchema } from './token.js';

// ============================================================================
// Member Role
// ============================================================================

export const MembershipRoleSchema = z.enum(['owner', 'admin', 'member']);

export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

/** In-app leave refusal and owner-row note. Links to the handover card. */
export const HAND_OVER_OWNERSHIP_FIRST_MESSAGE = 'Hand over ownership first.';

/** Settings Organization tab, Ownership card. */
export const HANDOVER_OWNERSHIP_PATH = '/settings#ownership';

/** Anyone removing the owner — dedicated, not INSUFFICIENT_PERMISSIONS */
export const OWNER_CANNOT_BE_REMOVED_MESSAGE = HAND_OVER_OWNERSHIP_FIRST_MESSAGE;

/** Owner's row in Settings, shown to everyone except the owner. */
export const THE_OWNER_CANT_BE_REMOVED_MESSAGE = "The owner can't be removed.";

/** Owner leave — reader is a workspace person, not the app admin */
export const OWNER_MUST_TRANSFER_MESSAGE = HAND_OVER_OWNERSHIP_FIRST_MESSAGE;

/** Admin-panel change-role — reader is the app admin */
export const OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE =
  'Transfer ownership first. Use Make owner on another member.';

export const BOT_CANNOT_TRANSFER_OWNERSHIP_MESSAGE = "Bots can't hand over ownership.";
export const BOT_CANNOT_BE_OWNER_MESSAGE = "A bot can't be the owner.";
export const TARGET_NOT_WORKSPACE_MEMBER_MESSAGE = "That person isn't a member here.";
export const NOT_CURRENT_OWNER_MESSAGE = 'Only the owner can hand over ownership.';
export const PERSONAL_WORKSPACE_TRANSFER_MESSAGE = "Personal workspaces can't be handed over.";
export const ALREADY_OWNER_MESSAGE = "You're already the owner.";
export const TRANSFER_OWNERSHIP_STORAGE_MESSAGE = "Couldn't hand over ownership. Try again.";

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

export const TransferOwnershipRequestSchema = z.object({
  userId: z.string().uuid(),
});

export type TransferOwnershipRequest = z.infer<typeof TransferOwnershipRequestSchema>;

export const TransferOwnershipResponseSchema = z.object({
  owner: MemberSchema,
  previousOwner: MemberSchema,
});

export type TransferOwnershipResponse = z.infer<typeof TransferOwnershipResponseSchema>;

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
