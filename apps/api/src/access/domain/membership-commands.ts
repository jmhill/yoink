import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';

export type AddMemberCommand = {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  /** True if this is the user's personal org (auto-created, cannot leave) */
  isPersonalOrg?: boolean;
};

export type Remover =
  | { kind: 'self' }
  | { kind: 'member'; userId: string };

/** Remove someone else (`by.kind === 'member'`) or leave (`by.kind === 'self'`). */
export type RemoveMember = {
  organizationId: string;
  userId: string;
  by: Remover;
};

export type RoleChanger =
  | {
      kind: 'member';
      userId: string;
      via: 'session' | 'token';
      principalKind: PrincipalKind;
    }
  | { kind: 'app-admin' };

/** In-app and admin-panel member/admin switch. Never assigns owner. */
export type ChangeMemberRole = {
  organizationId: string;
  userId: string;
  newRole: MembershipRole;
  by: RoleChanger;
};

/** Admin panel: name a human already in the workspace as owner. */
export type SetOwnerCommand = {
  organizationId: string;
  userId: string;
};

/**
 * #190 handover: the current owner names the next owner.
 * Reuses OwnershipTransferPlan from decideSetOwner / planOwnershipTransfer.
 */
export type TransferOwnership = {
  organizationId: string;
  fromUserId: string;
  toUserId: string;
};
