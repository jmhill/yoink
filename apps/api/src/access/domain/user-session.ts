import { z } from 'zod';

/**
 * A user session created after successful passkey authentication.
 *
 * Sessions are stored server-side (not stateless JWT) to allow:
 * - Session revocation
 * - Activity-based refresh
 * - Tracking which organization the user is currently viewing
 */
export const UserSessionSchema = z.object({
  /** Unique session identifier */
  id: z.string().uuid(),
  /** User this session belongs to */
  userId: z.string().uuid(),
  /** Organization the user is currently viewing/operating in */
  currentOrganizationId: z.string().uuid(),
  /** When the session was created */
  createdAt: z.string().datetime(),
  /** When the session expires (7 days from creation by default) */
  expiresAt: z.string().datetime(),
  /** When the session was last active (for refresh logic) */
  lastActiveAt: z.string().datetime(),
});

export type UserSession = z.infer<typeof UserSessionSchema>;
