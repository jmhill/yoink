export type PrincipalKind = 'human' | 'agent';

export type UserActor = {
  readonly kind: 'user';
  readonly userId: string;
};

export type BotActor = {
  readonly kind: 'bot';
  readonly tokenId: string;
  readonly name: string | null;
};

export type Actor = UserActor | BotActor;

export const actorFromSession = (userId: string): UserActor => ({
  kind: 'user',
  userId,
});

export const actorFromToken = (token: {
  id: string;
  name: string | null;
}): BotActor => ({
  kind: 'bot',
  tokenId: token.id,
  name: token.name,
});

export type AuthContext = {
  organizationId: string;
  userId: string;
  principalKind: PrincipalKind;
  actor: Actor;
};
