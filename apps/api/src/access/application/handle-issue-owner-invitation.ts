import { errAsync, type ResultAsync } from 'neverthrow';
import { normalizeEmail } from '@yoink/api-contracts';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { UserStore } from '../domain/user-store.js';
import type { Invitation } from '../domain/invitation.js';
import type { User } from '../domain/user.js';
import {
  decideIssueOwnerInvitation,
  type IssueOwnerInvitation,
  type IssueOwnerInvitationError,
} from '../domain/decide-issue-owner-invitation.js';
import {
  issueOwnerInvitationFailedError,
  type IssueOwnerInvitationFailedError,
} from '../domain/invitation-errors.js';
import {
  organizationNotFoundError,
  type OrganizationNotFoundError,
} from '../domain/admin-errors.js';

export type HandleIssueOwnerInvitationDeps = {
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  invitationStore: InvitationStore;
  userStore: UserStore;
  nextId: () => string;
  nextCode: () => string;
  now: () => string;
};

export type IssueOwnerInvitationResult =
  | { kind: 'owner-assigned'; owner: User }
  | { kind: 'owner-invited'; invitation: Invitation };

export type HandleIssueOwnerInvitationError =
  | OrganizationNotFoundError
  | IssueOwnerInvitationError
  | IssueOwnerInvitationFailedError;

export const handleIssueOwnerInvitation = (
  command: IssueOwnerInvitation,
  deps: HandleIssueOwnerInvitationDeps
): ResultAsync<IssueOwnerInvitationResult, HandleIssueOwnerInvitationError> => {
  const email = normalizeEmail(command.email);
  return deps.organizationStore
    .findById(command.organizationId)
    .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
    .andThen((organization) => {
      if (!organization) {
        return errAsync(organizationNotFoundError(command.organizationId));
      }
      return deps.membershipStore
        .findByOrganizationId(command.organizationId)
        .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
        .andThen((members) =>
          deps.invitationStore
            .findLiveOwnerInvitation(command.organizationId)
            .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
            .andThen((pendingOwnerInvitation) =>
              deps.userStore
                .findByNormalizedEmail(email)
                .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
                .andThen((account) => {
                  const decision = decideIssueOwnerInvitation({
                    command: { organizationId: command.organizationId, email },
                    organization,
                    members,
                    pendingOwnerInvitation,
                    account,
                    ids: {
                      membershipId: deps.nextId(),
                      invitationId: deps.nextId(),
                      eventId: deps.nextId(),
                      code: deps.nextCode(),
                    },
                    now: deps.now(),
                  });
                  if (decision.isErr()) {
                    return errAsync(decision.error);
                  }

                  const value = decision.value;
                  if (value.kind === 'owner-assigned') {
                    if (!account) {
                      return errAsync(
                        issueOwnerInvitationFailedError('owner-assigned without account')
                      );
                    }
                    const owner = account;
                    return deps.membershipStore
                      .assignOwnerFromInvite(value.plan, value.event, value.replaced)
                      .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
                      .map(() => ({ kind: 'owner-assigned' as const, owner }));
                  }

                  return deps.invitationStore
                    .issueOwnerInvitation(value.invitation, value.replaced)
                    .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
                    .map(() => ({
                      kind: 'owner-invited' as const,
                      invitation: value.invitation,
                    }));
                })
            )
        );
    });
};
