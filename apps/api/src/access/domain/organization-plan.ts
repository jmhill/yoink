import type { Organization } from './organization.js';

/**
 * One organization write this service owns. The access participant
 * compiles it. The unit of work does not inspect it. `kind` keeps this
 * plan distinct from admin's `create-organization` and
 * `rename-organization`. Admin create and rename stay on those plans.
 * The conflict update sets only the name, so `notes_mirror_bot_user_id`
 * and `time_zone` stay until M5.8 moves the mirror column.
 */
export type SaveOrganizationPlan = {
  readonly kind: 'save-organization';
  readonly organization: Organization;
};

export type OrganizationPlan = SaveOrganizationPlan;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === 'string';

export const isOrganizationPlan = (plan: unknown): plan is OrganizationPlan => {
  if (!isRecord(plan) || plan.kind !== 'save-organization') {
    return false;
  }
  return (
    hasString(plan.organization, 'id') &&
    hasString(plan.organization, 'name') &&
    hasString(plan.organization, 'createdAt')
  );
};
