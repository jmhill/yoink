import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Member } from '@yoink/api-contracts';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { User } from '../domain/user.js';
import { principalKindOf, type PrincipalKind } from '../domain/user.js';
import type { MemberRoleChanged } from '../domain/membership-events.js';
import type { ChangeMemberRole, RoleChanger } from '../domain/membership-commands.js';
import {
  decideChangeMemberRole,
  type ChangeMemberRoleError,
} from '../domain/decide-change-member-role.js';
import type { MembershipStorageError } from '../domain/organization-errors.js';
import { userNotFoundError, type UserServiceError } from '../domain/user-errors.js';
import type { ActorVia } from '../../shared/auth-context.js';

export type LoadMembers = (
  organizationId: string
) => ResultAsync<OrganizationMembership[], MembershipStorageError>;

export type LoadUser = (userId: string) => ResultAsync<User | null, UserServiceError>;

export type PersistChangeMemberRole = (input: {
  membership: OrganizationMembership;
  event: MemberRoleChanged;
}) => ResultAsync<void, MembershipStorageError>;

export type HandleChangeMemberRoleDeps = {
  loadMembers: LoadMembers;
  loadUser: LoadUser;
  persistChange: PersistChangeMemberRole;
  nextId: () => string;
  now: () => string;
};

export type ChangeMemberRoleRequest = {
  organizationId: string;
  userId: string;
  newRole: 'admin' | 'member';
  callerUserId: string;
  callerVia: ActorVia;
  principalKind: PrincipalKind;
};

export type HandleChangeMemberRoleError =
  | ChangeMemberRoleError
  | MembershipStorageError
  | UserServiceError;

export type ChangeMemberRoleHandler = (
  request: ChangeMemberRoleRequest
) => ResultAsync<Member, HandleChangeMemberRoleError>;

const toMember = (user: User, membership: OrganizationMembership): Member => ({
  userId: user.id,
  email: user.email,
  name: user.name,
  kind: principalKindOf(user),
  role: membership.role,
  joinedAt: membership.joinedAt,
});

export const roleChangerFromCaller = (request: {
  callerUserId: string;
  callerVia: ActorVia;
  principalKind: PrincipalKind;
}): RoleChanger => ({
  kind: 'member',
  userId: request.callerUserId,
  via: request.callerVia,
  principalKind: request.principalKind,
});

export const handleChangeMemberRole = (
  request: ChangeMemberRoleRequest,
  deps: HandleChangeMemberRoleDeps
): ResultAsync<Member, HandleChangeMemberRoleError> => {
  const command: ChangeMemberRole = {
    organizationId: request.organizationId,
    userId: request.userId,
    newRole: request.newRole,
    by: roleChangerFromCaller(request),
  };

  return deps.loadMembers(request.organizationId).andThen((members) =>
    deps.loadUser(request.userId).andThen((targetUser) => {
      const decision = decideChangeMemberRole({
        command,
        members,
        targetKind: targetUser === null ? 'human' : principalKindOf(targetUser),
        eventId: deps.nextId(),
        now: deps.now(),
      });
      if (decision.isErr()) {
        return errAsync(decision.error);
      }
      if (targetUser === null) {
        return errAsync(userNotFoundError(request.userId));
      }
      if (decision.value.kind === 'unchanged') {
        return okAsync(toMember(targetUser, decision.value.membership));
      }
      return deps
        .persistChange({
          membership: decision.value.membership,
          event: decision.value.event,
        })
        .map(() => toMember(targetUser, decision.value.membership));
    })
  );
};
