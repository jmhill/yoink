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
  status: 'inbox' | 'trashed' | 'processed';
  sourceUrl?: string;
  sourceApp?: string;
  organizationId: string;
  createdById: string;
  capturedAt: string;
  trashedAt?: string;
  snoozedUntil?: string;
  // Processing fields - populated when capture is converted to task/note
  processedAt?: string;
  processedToType?: 'task' | 'note';
  processedToId?: string;
};

export type Task = {
  id: string;
  title: string;
  organizationId: string;
  createdById: string;
  captureId?: string; // Source capture, if any
  dueDate?: string; // YYYY-MM-DD format
  completedAt?: string;
  pinnedAt?: string;
  createdAt: string;
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

export type PasskeyCredentialInfo = {
  id: string;
  name?: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt?: string;
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

// Content-only updates - explicit operations handle status/pin/snooze
export type UpdateCaptureInput = {
  content?: string;
  title?: string;
};

export type CreateTaskInput = {
  title: string;
  dueDate?: string; // YYYY-MM-DD format
};

export type UpdateTaskInput = {
  title?: string;
  dueDate?: string | null; // null to clear, undefined to keep unchanged
};

export type ProcessCaptureToTaskInput = {
  title?: string; // Defaults to capture content
  dueDate?: string; // YYYY-MM-DD format
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
