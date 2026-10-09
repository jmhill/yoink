import type { TokenName } from './token-name.js';

export type TokenCreated = {
  type: 'TokenCreated';
  id: string;
  userId: string;
  organizationId: string;
  name: TokenName;
  createdAt: string;
};

export type TokenRenamed = {
  type: 'TokenRenamed';
  id: string;
  userId: string;
  organizationId: string;
  name: TokenName;
};

export type TokenRevoked = {
  type: 'TokenRevoked';
  id: string;
  userId: string;
};

export type TokenEvent = TokenCreated | TokenRenamed | TokenRevoked;
