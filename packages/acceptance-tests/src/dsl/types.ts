/**
 * Domain types for acceptance tests.
 * These represent the core entities in our domain.
 */

// =============================================================================
// Entities
// =============================================================================

export type Capture = {
  id: string;
  content: string;
  title?: string;
  status: 'inbox' | 'archived';
  sourceUrl?: string;
  sourceApp?: string;
  organizationId: string;
  createdById: string;
  capturedAt: string;
  archivedAt?: string;
  pinnedAt?: string;
};

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  organizationId: string;
  createdAt: string;
};

export type Token = {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
};

// =============================================================================
// Input Types
// =============================================================================

export type CreateCaptureInput = {
  content: string;
  title?: string;
  sourceUrl?: string;
  sourceApp?: string;
};

export type UpdateCaptureInput = {
  content?: string;
  title?: string;
  status?: 'inbox' | 'archived';
  pinned?: boolean;
};

// =============================================================================
// Result Types
// =============================================================================

export type CreateTokenResult = {
  token: Token;
  rawToken: string;
};

export type HealthStatus = {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
};
