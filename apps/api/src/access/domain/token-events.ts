export type TokenCreated = {
  type: 'TokenCreated';
  id: string;
  userId: string;
  organizationId: string;
  name: string;
  createdAt: string;
};

export type TokenRevoked = {
  type: 'TokenRevoked';
  id: string;
  userId: string;
  organizationId: string;
  revokedAt: string;
};

export type TokenEvent = TokenCreated | TokenRevoked;
