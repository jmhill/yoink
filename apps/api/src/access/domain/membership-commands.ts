import type { MembershipRole } from './organization-membership.js';

export type AddMemberCommand = {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  /** True if this is the user's personal org (auto-created, cannot leave) */
  isPersonalOrg?: boolean;
};

export type RemoveMemberCommand = {
  userId: string;
  organizationId: string;
  /**
   * Who is removing the member. Omit (or pass the same userId) for leave.
   * When it differs, decideRemoveMember applies remove-others permissions.
   */
  actorUserId?: string;
};

export type ChangeRoleCommand = {
  organizationId: string;
  userId: string;
  newRole: MembershipRole;
};

/** Admin panel: name a human already in the workspace as owner. */
export type SetOwnerCommand = {
  organizationId: string;
  userId: string;
};

/**
 * #190 handover: the current owner names the next owner.
 * Reuses OwnershipTransferred from decideSetOwner / planOwnershipTransfer.
 */
export type TransferOwnershipCommand = {
  organizationId: string;
  fromUserId: string;
  toUserId: string;
};
