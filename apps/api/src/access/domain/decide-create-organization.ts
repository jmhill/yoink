import type { CreateOrganizationPlan } from './admin-plan.js';

export type DecideCreateOrganizationInput = {
  readonly name: string;
  readonly id: string;
  readonly now: string;
};

/** A new workspace row. The id is new, so the write is not a guard. */
export const decideCreateOrganization = (
  input: DecideCreateOrganizationInput
): CreateOrganizationPlan => ({
  kind: 'create-organization',
  organization: {
    id: input.id,
    name: input.name,
    createdAt: input.now,
  },
});
