export type PrincipalKind = 'human' | 'agent';

export type ActorVia = 'session' | 'token';

export type UserActor = {
  readonly kind: 'user';
  readonly userId: string;
  readonly via: ActorVia;
};

export type BotActor = {
  readonly kind: 'bot';
  readonly tokenId: string;
  readonly userId: string;
  readonly name: string;
  readonly via: 'token';
};

export type Actor = UserActor | BotActor;

export const actorFromSession = (userId: string): UserActor => ({
  kind: 'user',
  userId,
  via: 'session',
});

export const actorFromToken = (
  token: {
    id: string;
    userId: string;
    name: string;
  },
  ownerKind: PrincipalKind
): Actor => {
  switch (ownerKind) {
    case 'human':
      return {
        kind: 'user',
        userId: token.userId,
        via: 'token',
      };
    case 'agent':
      return {
        kind: 'bot',
        tokenId: token.id,
        userId: token.userId,
        name: token.name,
        via: 'token',
      };
  }
};

export type AuthContext = {
  organizationId: string;
  userId: string;
  principalKind: PrincipalKind;
  actor: Actor;
};
