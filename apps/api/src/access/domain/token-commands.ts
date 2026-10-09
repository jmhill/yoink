import type { Actor } from './actor.js';

export type CreateTokenCommand = {
  actor: Actor;
  userId: string;
  organizationId: string;
  name: string;
};

export type RevokeTokenCommand = {
  actor: Actor;
  tokenId: string;
  userId: string;
  organizationId: string;
};

export type ReissueAgentTokenCommand = {
  organizationId: string;
  memberUserId: string;
  actor: Actor;
};
