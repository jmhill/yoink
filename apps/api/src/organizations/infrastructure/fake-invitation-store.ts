import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Invitation } from '../domain/invitation.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import { invitationStorageError, type InvitationStorageError } from '../domain/invitation-errors.js';

export type FakeInvitationStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialInvitations?: Invitation[];
};

export const createFakeInvitationStore = (
  options: FakeInvitationStoreOptions = {}
): InvitationStore => {
  const invitations: Invitation[] = [...(options.initialInvitations ?? [])];

  return {
    save: (invitation: Invitation): ResultAsync<void, InvitationStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(invitationStorageError('Save failed'));
      }
      // Check if already exists (update) or new (insert)
      const existingIndex = invitations.findIndex((i) => i.id === invitation.id);
      if (existingIndex >= 0) {
        invitations[existingIndex] = invitation;
      } else {
        invitations.push(invitation);
      }
      return okAsync(undefined);
    },

    findById: (id: string): ResultAsync<Invitation | null, InvitationStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(invitationStorageError('Find failed'));
      }
      const found = invitations.find((i) => i.id === id);
      return okAsync(found ?? null);
    },

    findByCode: (code: string): ResultAsync<Invitation | null, InvitationStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(invitationStorageError('Find failed'));
      }
      const found = invitations.find((i) => i.code === code);
      return okAsync(found ?? null);
    },

    findPendingByOrganization: (
      organizationId: string,
      currentTime: string
    ): ResultAsync<Invitation[], InvitationStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(invitationStorageError('Find failed'));
      }
      const found = invitations.filter(
        (i) =>
          i.organizationId === organizationId &&
          i.acceptedAt === null &&
          i.expiresAt > currentTime
      );
      // Sort by createdAt descending
      found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return okAsync(found);
    },

    findByOrganization: (
      organizationId: string
    ): ResultAsync<Invitation[], InvitationStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(invitationStorageError('Find failed'));
      }
      const found = invitations.filter((i) => i.organizationId === organizationId);
      // Sort by createdAt descending
      found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return okAsync(found);
    },

    delete: (id: string): ResultAsync<void, InvitationStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(invitationStorageError('Delete failed'));
      }
      const index = invitations.findIndex((i) => i.id === id);
      if (index >= 0) {
        invitations.splice(index, 1);
      }
      return okAsync(undefined);
    },
  };
};
