import type { ResultAsync } from 'neverthrow';
import type { Invitation } from './invitation.js';
import type { InvitationStorageError } from './invitation-errors.js';

/**
 * Store interface for invitation persistence.
 */
export type InvitationStore = {
  /** Save an invitation (create or update) */
  save(invitation: Invitation): ResultAsync<void, InvitationStorageError>;

  /** Find an invitation by its ID */
  findById(id: string): ResultAsync<Invitation | null, InvitationStorageError>;

  /** Find an invitation by its code (primary lookup method for accepting) */
  findByCode(code: string): ResultAsync<Invitation | null, InvitationStorageError>;

  /** Find pending invitations by organization (not accepted, not expired) */
  findPendingByOrganization(
    organizationId: string,
    currentTime: string
  ): ResultAsync<Invitation[], InvitationStorageError>;

  /** Find all invitations by organization (including expired/accepted, for history) */
  findByOrganization(organizationId: string): ResultAsync<Invitation[], InvitationStorageError>;

  /** Delete an invitation by ID */
  delete(id: string): ResultAsync<void, InvitationStorageError>;

  /**
   * The live owner invite for a workspace: unaccepted and unreplaced,
   * including expired rows so a new issue can mark them replaced.
   */
  findLiveOwnerInvitation(
    organizationId: string
  ): ResultAsync<Invitation | null, InvitationStorageError>;

  /** Mark the previous live owner invite replaced, then insert the new one. */
  issueOwnerInvitation(
    invitation: Invitation,
    replaced: Invitation | null
  ): ResultAsync<void, InvitationStorageError>;
};
