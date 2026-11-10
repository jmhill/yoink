import type { ApiToken } from './api-token.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { User } from './user.js';

/**
 * One agent mint. The access participant compiles it. The unit of work
 * does not inspect it. `kind` keeps this plan distinct from signup and admin.
 * The raw secret is not here.
 */
export type MintAgentPlan = {
  readonly kind: 'mint-agent';
  readonly user: User;
  readonly membership: OrganizationMembership;
  readonly token: ApiToken;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === 'string';

export const isMintAgentPlan = (plan: unknown): plan is MintAgentPlan =>
  isRecord(plan) &&
  plan.kind === 'mint-agent' &&
  hasString(plan.user, 'id') &&
  hasString(plan.membership, 'id') &&
  hasString(plan.token, 'id') &&
  hasString(plan.token, 'tokenHash');
