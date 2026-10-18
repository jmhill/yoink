import { errAsync, type ResultAsync } from 'neverthrow';
import { memberDisplayName } from '@yoink/api-contracts';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { User } from '../domain/user.js';
import type { MemberLeft, MemberRemoved } from '../domain/membership-events.js';
import type { RemoveMember } from '../domain/membership-commands.js';
import { decideRemoveMember, type RemoveMemberError } from '../domain/decide-remove-member.js';
import {
  memberRemoveFailedError,
  type MemberRemoveFailedError,
  type MembershipStorageError,
} from '../domain/organization-errors.js';
import type { UserServiceError } from '../domain/user-errors.js';

export type LoadMembers = (
  organizationId: string
) => ResultAsync<OrganizationMembership[], MembershipStorageError>;

export type LoadUser = (userId: string) => ResultAsync<User | null, UserServiceError>;

export type PersistRemoveMember = (input: {
  membershipId: string;
  event: MemberRemoved | MemberLeft;
}) => ResultAsync<void, MembershipStorageError>;

export type HandleRemoveMemberDeps = {
  loadMembers: LoadMembers;
  loadUser: LoadUser;
  persistRemove: PersistRemoveMember;
  nextId: () => string;
  now: () => string;
};

export type RemoveMemberRequest = {
  organizationId: string;
  userId: string;
  by: RemoveMember['by'];
};

export type HandleRemoveMemberError =
  | RemoveMemberError
  | MemberRemoveFailedError
  | UserServiceError;

export type RemoveMemberHandler = (
  request: RemoveMemberRequest
) => ResultAsync<void, HandleRemoveMemberError>;

const displayNameOf = (user: User | null): string =>
  user === null ? 'member' : memberDisplayName({ email: user.email, name: user.name });

export const handleRemoveMember = (
  request: RemoveMemberRequest,
  deps: HandleRemoveMemberDeps
): ResultAsync<void, HandleRemoveMemberError> => {
  const command: RemoveMember = {
    organizationId: request.organizationId,
    userId: request.userId,
    by: request.by,
  };

  return deps.loadMembers(request.organizationId).mapErr(() => memberRemoveFailedError('member')).andThen((members) =>
    deps.loadUser(request.userId).andThen((targetUser) => {
      const decision = decideRemoveMember({
        command,
        members,
        eventId: deps.nextId(),
        now: deps.now(),
      });
      if (decision.isErr()) {
        return errAsync(decision.error);
      }
      const memberName = displayNameOf(targetUser);
      return deps
        .persistRemove({
          membershipId: decision.value.membership.id,
          event: decision.value.event,
        })
        .mapErr(() => memberRemoveFailedError(memberName));
    })
  );
};
