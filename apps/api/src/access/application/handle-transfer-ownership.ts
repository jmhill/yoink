import { errAsync, type ResultAsync } from 'neverthrow';
import type { Member } from '@yoink/api-contracts';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { User } from '../domain/user.js';
import { principalKindOf, type PrincipalKind } from '../domain/user.js';
import type { OwnershipTransferPlan } from '../domain/owner-presence.js';
import type { OwnershipTransferred } from '../domain/membership-events.js';
import { decideTransferOwnership, type TransferOwnershipError } from '../domain/decide-transfer-ownership.js';
import type { MembershipStorageError } from '../domain/organization-errors.js';
import { userNotFoundError, type UserServiceError } from '../domain/user-errors.js';

export type LoadMembers = (
  organizationId: string
) => ResultAsync<OrganizationMembership[], MembershipStorageError>;

export type LoadUser = (userId: string) => ResultAsync<User | null, UserServiceError>;

export type PersistTransferOwnership = (input: {
  plan: OwnershipTransferPlan;
  event: OwnershipTransferred;
}) => ResultAsync<void, MembershipStorageError>;

export type HandleTransferOwnershipDeps = {
  loadMembers: LoadMembers;
  loadUser: LoadUser;
  persistTransfer: PersistTransferOwnership;
  nextId: () => string;
  now: () => string;
};

export type TransferOwnershipRequest = {
  organizationId: string;
  toUserId: string;
  callerUserId: string;
  actorKind: PrincipalKind;
};

export type TransferOwnershipView = {
  owner: Member;
  previousOwner: Member;
};

export type HandleTransferOwnershipError =
  | TransferOwnershipError
  | MembershipStorageError
  | UserServiceError;

export type TransferOwnershipHandler = (
  request: TransferOwnershipRequest
) => ResultAsync<TransferOwnershipView, HandleTransferOwnershipError>;

const toMember = (user: User, membership: OrganizationMembership): Member => ({
  userId: user.id,
  email: user.email,
  name: user.name,
  kind: principalKindOf(user),
  role: membership.role,
  joinedAt: membership.joinedAt,
});

export const handleTransferOwnership = (
  request: TransferOwnershipRequest,
  deps: HandleTransferOwnershipDeps
): ResultAsync<TransferOwnershipView, HandleTransferOwnershipError> => {
  return deps.loadMembers(request.organizationId).andThen((members) =>
    deps.loadUser(request.toUserId).andThen((targetUser) => {
      const decision = decideTransferOwnership({
        command: {
          organizationId: request.organizationId,
          fromUserId: request.callerUserId,
          toUserId: request.toUserId,
        },
        members,
        targetUser,
        actorKind: request.actorKind,
        eventId: deps.nextId(),
        now: deps.now(),
      });
      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const { plan, event } = decision.value;
      const demote = plan.demote;
      if (!targetUser || !demote) {
        return errAsync(userNotFoundError(request.toUserId));
      }

      return deps.loadUser(request.callerUserId).andThen((callerUser) => {
        if (!callerUser) {
          return errAsync(userNotFoundError(request.callerUserId));
        }
        return deps.persistTransfer({ plan, event }).map(() => ({
          owner: toMember(targetUser, plan.promote),
          previousOwner: toMember(callerUser, demote),
        }));
      });
    })
  );
};
