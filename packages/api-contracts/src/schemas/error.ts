import { z } from 'zod';

export const ErrorSchema = z.object({
  message: z.string(),
});

export type ApiError = z.infer<typeof ErrorSchema>;
