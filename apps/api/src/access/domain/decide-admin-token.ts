import type { ApiToken } from './api-token.js';
import type { CreateAdminTokenPlan, RevokeAdminTokenPlan } from './admin-plan.js';

export type AdminCreateTokenCommand = {
  readonly organizationId: string;
  readonly userId: string;
  readonly name: string;
};

export type DecideAdminTokenInput = {
  readonly command: AdminCreateTokenCommand;
  readonly tokenId: string;
  readonly tokenHash: string;
  readonly now: string;
};

/** The hash is already computed. The raw secret is not part of the plan. */
export const decideAdminToken = (input: DecideAdminTokenInput): CreateAdminTokenPlan => {
  const token: ApiToken = {
    id: input.tokenId,
    userId: input.command.userId,
    organizationId: input.command.organizationId,
    tokenHash: input.tokenHash,
    name: input.command.name.trim(),
    createdAt: input.now,
  };
  return { kind: 'create-admin-token', token };
};

export const decideRevokeAdminToken = (input: {
  readonly tokenId: string;
  readonly revokedAt: string;
}): RevokeAdminTokenPlan => ({
  kind: 'revoke-admin-token',
  tokenId: input.tokenId,
  revokedAt: input.revokedAt,
});
