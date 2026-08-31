import { z } from 'zod';

export const NamedListSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  createdById: z.string().uuid(),
});

export type NamedList = z.infer<typeof NamedListSchema>;

export const CreateNamedListSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export type CreateNamedList = z.infer<typeof CreateNamedListSchema>;
