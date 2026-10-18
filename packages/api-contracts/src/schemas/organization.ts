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

/** Owner's row in Settings, and anyone removing the owner. */
export const THE_OWNER_CANT_BE_REMOVED_MESSAGE = "The owner can't be removed.";

/** Owner leave — reader is a workspace person, not the app admin */
export const OWNER_MUST_TRANSFER_MESSAGE = HAND_OVER_OWNERSHIP_FIRST_MESSAGE;

/** Admin-panel change-role — reader is the app admin */
export const OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE =
  'Transfer ownership first. Use Make owner on another member.';

export const BOT_CANNOT_TRANSFER_OWNERSHIP_MESSAGE = "Bots can't hand over ownership.";
export const BOT_CANNOT_BE_OWNER_MESSAGE = "A bot can't be the owner.";
export const TARGET_NOT_WORKSPACE_MEMBER_MESSAGE = 'The new owner has to be a member first.';
export const NOT_CURRENT_OWNER_MESSAGE = 'Only the owner can hand over ownership.';
export const PERSONAL_WORKSPACE_TRANSFER_MESSAGE = "Personal workspaces can't be handed over.";
export const ALREADY_OWNER_MESSAGE = "You're already the owner.";
export const TRANSFER_OWNERSHIP_STORAGE_MESSAGE = "Couldn't hand over ownership. Try again.";

export const BOT_CANNOT_CHANGE_ROLES_MESSAGE = "Bots can't change roles.";
export const ROLE_CHANGE_NOT_ALLOWED_MESSAGE = 'Only the owner and admins can change roles.';
export const CANNOT_CHANGE_OWN_ROLE_MESSAGE = "You can't change your own role.";
export const OWNER_ROLE_LOCKED_MESSAGE = "The owner's role can't be changed.";
export const BOT_CANNOT_BE_ADMIN_MESSAGE = "A bot can't be an admin.";
export const REMOVE_NOT_ALLOWED_MESSAGE = 'Only the owner and admins can remove members.';
export const CANNOT_REMOVE_SELF_MESSAGE = "You can't remove yourself. Use Leave instead.";
export const REISSUE_NOT_ALLOWED_MESSAGE = 'Only the owner and admins can issue new tokens.';
export const CHANGE_ROLE_STORAGE_MESSAGE = "Couldn't change the role. Try again.";
export const REISSUE_TOKEN_STORAGE_MESSAGE = "Couldn't issue a new token. Try again.";
export const MAKE_ADMIN_LABEL = 'Make admin';
export const MAKE_MEMBER_LABEL = 'Make member';
export const THERE_HAS_TO_BE_AT_LEAST_ONE_ADMIN_MESSAGE =
  'There has to be at least one admin.';

export const removeMemberFailedMessage = (name: string): string =>
  `Couldn't remove ${name}. Try again.`;

export const madeAdminToast = (name: string): string => `${name} is now an admin.`;

export const madeMemberToast = (name: string): string => `${name} is now a member.`;

export const demoteConfirmMessage = (name: string): string =>
  `Make ${name} a member? They'll lose admin access.`;

/** Same display-name rule as the members list: given name, else email. */
export const memberDisplayName = (member: {
  name?: string;
  email: string;
}): string => member.name ?? member.email;

export const OWNER_EMAIL_LABEL = 'Owner email';
export const OWNER_EMAIL_HELP =
  "They'll be the owner. If they don't have an account yet, you'll get an invite link to send them.";
export const OWNER_EMAIL_REQUIRED_MESSAGE = "Enter the owner's email.";
export const COPY_LINK_LABEL = 'Copy link';
export const LINK_COPIED_TOAST = 'Link copied.';
export const NEW_LINK_LABEL = 'New link';
export const USE_DIFFERENT_EMAIL_LABEL = 'Use a different email';
export const CREATE_OWNER_INVITE_LABEL = 'Create owner invite';
export const MAKE_NEW_LINK_LABEL = 'Make new link';
export const CANCEL_LABEL = 'Cancel';
export const WORKSPACE_ALREADY_HAS_OWNER_MESSAGE = 'This workspace already has an owner.';
export const PERSONAL_WORKSPACE_OWNER_INVITE_MESSAGE =
  "Personal workspaces can't get an owner invite.";
export const CREATE_WORKSPACE_STORAGE_MESSAGE = "Couldn't create the workspace. Try again.";
export const CREATE_OWNER_INVITE_STORAGE_MESSAGE =
  "Couldn't create the owner invite. Try again.";

export const ownerAssignedToast = (name: string, workspace: string): string =>
  `${name} is now the owner of ${workspace}.`;

export const ownerInviteCreatedMessage = (email: string): string =>
  `Send this link to ${email}. They'll become the owner when they sign up with that email.`;

export const ownerInvitePending = (email: string, date: string): string =>
  `Waiting for ${email} to accept the owner invite. Expires ${date}.`;

export const newLinkConfirm = (email: string): string =>
  `Make a new link for ${email}? The old link will stop working.`;

export const ownerLabel = (name: string): string => `Owner: ${name}`;

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

export const ChangeMemberRoleRequestSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export type ChangeMemberRoleRequest = z.infer<typeof ChangeMemberRoleRequestSchema>;

export const ChangeMemberRoleResponseSchema = z.object({
  member: MemberSchema,
});

export type ChangeMemberRoleResponse = z.infer<typeof ChangeMemberRoleResponseSchema>;

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
