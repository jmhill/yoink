import { errAsync, type ResultAsync } from 'neverthrow';
import { normalizeEmail } from '@yoink/api-contracts';
import type { UserStore } from '../domain/user-store.js';
import type { WorkspaceStore } from '../domain/workspace-store.js';
import type { Organization } from '../domain/organization.js';
import type { Invitation } from '../domain/invitation.js';
import type { User } from '../domain/user.js';
import {
  decideCreateWorkspace,
  type CreateWorkspace,
  type CreateWorkspaceError,
} from '../domain/decide-create-workspace.js';
import {
  createWorkspaceFailedError,
  type CreateWorkspaceFailedError,
} from '../domain/invitation-errors.js';

export type HandleCreateWorkspaceDeps = {
  userStore: UserStore;
  workspaceStore: WorkspaceStore;
  nextId: () => string;
  nextCode: () => string;
  now: () => string;
};

export type CreateWorkspaceResult =
  | {
      kind: 'owner-assigned';
      organization: Organization;
      owner: User;
    }
  | {
      kind: 'owner-invited';
      organization: Organization;
      invitation: Invitation;
    };

export type HandleCreateWorkspaceError = CreateWorkspaceError | CreateWorkspaceFailedError;

export const handleCreateWorkspace = (
  command: CreateWorkspace,
  deps: HandleCreateWorkspaceDeps
): ResultAsync<CreateWorkspaceResult, HandleCreateWorkspaceError> => {
  const ownerEmail = normalizeEmail(command.ownerEmail);
  return deps.userStore
    .findByNormalizedEmail(ownerEmail)
    .mapErr((error) => createWorkspaceFailedError(error.cause ?? error))
    .andThen((ownerAccount) => {
      const decision = decideCreateWorkspace({
        command: { name: command.name, ownerEmail },
        ownerAccount,
        ids: {
          organizationId: deps.nextId(),
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
        if (!ownerAccount) {
          return errAsync(createWorkspaceFailedError('owner-assigned without account'));
        }
        const owner = ownerAccount;
        return deps.workspaceStore
          .createWithOwner(value.organization, value.membership, value.event)
          .mapErr((error) => createWorkspaceFailedError(error.cause ?? error))
          .map(() => ({
            kind: 'owner-assigned' as const,
            organization: value.organization,
            owner,
          }));
      }

      return deps.workspaceStore
        .createWithOwnerInvite(value.organization, value.invitation)
        .mapErr((error) => createWorkspaceFailedError(error.cause ?? error))
        .map(() => ({
          kind: 'owner-invited' as const,
          organization: value.organization,
          invitation: value.invitation,
        }));
    });
};
