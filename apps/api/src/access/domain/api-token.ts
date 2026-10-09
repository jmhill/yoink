import { z } from 'zod';
import type { TokenName } from './token-name.js';

export const ApiTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  tokenHash: z.string().min(1),
  name: z.string().min(1).max(200).nullable(),
  lastUsedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
});

export type ApiToken = Omit<z.infer<typeof ApiTokenSchema>, 'name'> & {
  name: TokenName | null;
};
