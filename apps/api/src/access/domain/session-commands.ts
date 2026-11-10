export type CreateSessionCommand = {
  userId: string;
  /** Optional: specify which org to start in (must be a member) */
  organizationId?: string;
};
