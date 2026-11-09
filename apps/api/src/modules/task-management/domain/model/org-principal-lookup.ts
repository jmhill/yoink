import type { ResultAsync } from 'neverthrow';

/**
 * Narrow port so tasks can validate an assignee without importing access stores.
 */
export type OrgPrincipalLookup = {
  existsInOrganization(
    principalId: string,
    organizationId: string
  ): ResultAsync<boolean, never>;
};
