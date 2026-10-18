// Public API of the Administration & Access context (application layer).
// Cross-context consumers import from this index only.

// Auth middleware
export { createAuthMiddleware, type AuthMiddleware } from './auth-middleware.js';
export { createCombinedAuthMiddleware } from './combined-auth-middleware.js';
export { createUserSessionMiddleware } from './user-session-middleware.js';
export {
  withAuthenticatedRateLimit,
  type AuthenticatedRateLimitConsume,
} from './with-authenticated-rate-limit.js';

// Route registration
export { registerAuthRoutes } from './auth-routes.js';
export { registerSignupRoutes } from './signup-routes.js';
export { registerPasskeyRoutes } from './passkey-routes.js';
export { registerTokenRoutes } from './token-routes.js';
export { registerOrganizationRoutes } from './organization-routes.js';
export type { ReissueAgentToken } from './handle-reissue-agent-token.js';
export type { TransferOwnershipHandler } from './handle-transfer-ownership.js';
export type { ChangeMemberRoleHandler } from './handle-change-member-role.js';
export type { RemoveMemberHandler } from './handle-remove-member.js';
export { registerInvitationRoutes } from './invitation-routes.js';
export { registerAdminRoutes } from './admin-routes.js';
