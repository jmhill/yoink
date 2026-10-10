import type { Actor } from '../../shared/auth-context.js';

export type ValidateTokenQuery = {
  plaintext: string;
};

export type ListTokensQuery = {
  actor: Actor;
  userId: string;
  organizationId: string;
};
