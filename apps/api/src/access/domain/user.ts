import { z } from 'zod';

export const PrincipalKindSchema = z.enum(['human', 'agent']);

export type PrincipalKind = z.infer<typeof PrincipalKindSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100).optional(),
  kind: PrincipalKindSchema.optional(),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

/** Humans are the default; omitted kind means human. */
export const principalKindOf = (user: User): PrincipalKind => user.kind ?? 'human';

export const isAgent = (user: User): boolean => principalKindOf(user) === 'agent';

/** Reserved unique email so agents satisfy the users.email uniqueness constraint. */
export const agentEmailFor = (userId: string): string => `agent-${userId}@yoink.invalid`;
