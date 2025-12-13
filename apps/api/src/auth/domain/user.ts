import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;
