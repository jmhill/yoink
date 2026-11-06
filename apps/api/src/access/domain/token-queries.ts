import type { Actor } from '../../kernel/auth-context.js';

export type ValidateTokenQuery = {
  plaintext: string;
};

export type ListTokensQuery = {
  actor: Actor;
  userId: string;
  organizationId: string;
};
