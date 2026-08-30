export type PrincipalKind = 'human' | 'agent';

export type AuthContext = {
  organizationId: string;
  userId: string;
  principalKind: PrincipalKind;
};
