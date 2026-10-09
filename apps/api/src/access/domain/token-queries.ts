import type { Actor } from './actor.js';

export type ValidateTokenQuery = {
  plaintext: string;
};

export type ListTokensQuery = {
  actor: Actor;
  userId: string;
  organizationId: string;
};
