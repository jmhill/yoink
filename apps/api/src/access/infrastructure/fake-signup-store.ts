import { errAsync, type ResultAsync } from 'neverthrow';
import type { UserStore } from '../domain/user-store.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type {
  CompleteSignupRecord,
  SignupStore,
  SignupStorageError,
} from '../domain/signup-store.js';
import { signupStorageError } from '../domain/signup-store.js';
import type { OwnerAssigned } from '../domain/membership-events.js';

export type FakeSignupStoreOptions = {
  userStore: UserStore;
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  invitationStore: InvitationStore;
  shouldFailOnCompleteSignup?: boolean;
};

export type FakeSignupStore = SignupStore & {
  recordedEvents(): readonly OwnerAssigned[];
};

export const createFakeSignupStore = (
  options: FakeSignupStoreOptions
): FakeSignupStore => {
  const events: OwnerAssigned[] = [];

  return {
    completeSignup: (
      record: CompleteSignupRecord
    ): ResultAsync<void, SignupStorageError> => {
      if (options.shouldFailOnCompleteSignup) {
        return errAsync(signupStorageError('Failed to complete signup', new Error('injected')));
      }
      return options.userStore
        .save(record.user)
        .mapErr((error) => signupStorageError('Failed to create user', error))
        .andThen(() =>
          options.organizationStore
            .save(record.personalOrganization)
            .mapErr((error) =>
              signupStorageError('Failed to create personal organization', error)
            )
        )
        .andThen(() =>
          options.membershipStore
            .save(record.personalMembership)
            .mapErr((error) =>
              signupStorageError('Failed to create personal membership', error)
            )
        )
        .andThen(() =>
          options.membershipStore
            .save(record.invitedMembership)
            .mapErr((error) =>
              signupStorageError('Failed to create invited membership', error)
            )
        )
        .andThen(() =>
          options.invitationStore
            .save(record.accepted)
            .mapErr((error) => signupStorageError('Failed to accept invitation', error))
        )
        .map(() => {
          if (record.event) {
            events.push(record.event);
          }
        });
    },

    recordedEvents: () => events,
  };
};
