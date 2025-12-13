import { z } from 'zod';

export const ApiTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tokenHash: z.string().min(1),
  name: z.string().min(1).max(100),
  lastUsedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

export type ApiToken = z.infer<typeof ApiTokenSchema>;
