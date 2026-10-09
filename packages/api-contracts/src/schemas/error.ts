import { z } from 'zod';

export const ErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});

export type ApiError = z.infer<typeof ErrorSchema>;
