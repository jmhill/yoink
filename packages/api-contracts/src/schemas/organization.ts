import { z } from 'zod';

// ============================================================================
// Switch Organization
// ============================================================================

/**
 * Request to switch the current organization for a session.
 */
export const SwitchOrganizationRequestSchema = z.object({
  organizationId: z.string().uuid(),
});

export type SwitchOrganizationRequest = z.infer<typeof SwitchOrganizationRequestSchema>;

/**
 * Response after successfully switching organizations.
 */
export const SwitchOrganizationResponseSchema = z.object({
  success: z.literal(true),
});

export type SwitchOrganizationResponse = z.infer<typeof SwitchOrganizationResponseSchema>;

// ============================================================================
// Leave Organization
// ============================================================================

/**
 * Response after successfully leaving an organization.
 */
export const LeaveOrganizationResponseSchema = z.object({
  success: z.literal(true),
});

export type LeaveOrganizationResponse = z.infer<typeof LeaveOrganizationResponseSchema>;
