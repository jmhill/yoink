import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  database: z.enum(['connected', 'disconnected']),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
