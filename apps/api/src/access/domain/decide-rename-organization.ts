import type { Organization } from './organization.js';
import type { RenameOrganizationPlan } from './admin-plan.js';

export type DecideRenameOrganizationInput = {
  readonly organization: Organization | null;
  readonly name: string;
};

/**
 * Missing workspace is not an error. The caller returns null and writes
 * nothing. A found workspace keeps its id and createdAt.
 */
export const decideRenameOrganization = (
  input: DecideRenameOrganizationInput
): RenameOrganizationPlan | null => {
  if (!input.organization) {
    return null;
  }
  return {
    kind: 'rename-organization',
    organization: {
      ...input.organization,
      name: input.name,
    },
  };
};
