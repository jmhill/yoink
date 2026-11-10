/**
 * One api_tokens write this service owns. The access participant compiles
 * it. The unit of work does not inspect it. List stays a read. Validate's
 * last-used update stays the token store.
 */
export type IssueTokenPlan = {
  readonly kind: 'issue-token';
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly tokenHash: string;
  readonly name: string;
  readonly createdAt: string;
};

export type RevokeTokenPlan = {
  readonly kind: 'revoke-token';
  readonly tokenId: string;
  readonly revokedAt: string;
};

export type TokenPlan = IssueTokenPlan | RevokeTokenPlan;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isTokenPlan = (plan: unknown): plan is TokenPlan => {
  if (!isRecord(plan)) {
    return false;
  }
  if (plan.kind === 'issue-token') {
    return (
      typeof plan.id === 'string' &&
      typeof plan.userId === 'string' &&
      typeof plan.organizationId === 'string' &&
      typeof plan.tokenHash === 'string' &&
      typeof plan.name === 'string' &&
      typeof plan.createdAt === 'string'
    );
  }
  if (plan.kind === 'revoke-token') {
    return typeof plan.tokenId === 'string' && typeof plan.revokedAt === 'string';
  }
  return false;
};

export const planIssueToken = (input: {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly tokenHash: string;
  readonly name: string;
  readonly createdAt: string;
}): IssueTokenPlan => ({
  kind: 'issue-token',
  id: input.id,
  userId: input.userId,
  organizationId: input.organizationId,
  tokenHash: input.tokenHash,
  name: input.name,
  createdAt: input.createdAt,
});

/** A missing or already-revoked id is still this update. Decide rejects it first. */
export const planRevokeToken = (input: {
  readonly tokenId: string;
  readonly revokedAt: string;
}): RevokeTokenPlan => ({
  kind: 'revoke-token',
  tokenId: input.tokenId,
  revokedAt: input.revokedAt,
});
