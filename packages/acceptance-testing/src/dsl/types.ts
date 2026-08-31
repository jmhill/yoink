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

export type NamedList = {
  id: string;
  name: string;
  organizationId: string;
  createdById: string;
  createdAt: string;
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
  assigneeId?: string;
  listId?: string;
};

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
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

export type Invitation = {
  id: string;
  code: string;
  email: string | null;
  organizationId: string;
  role: 'admin' | 'member';
  expiresAt: string;
  createdAt: string;
};

export type CreateInvitationInput = {
  role?: 'admin' | 'member';
  email?: string;
  expiresInDays?: number;
};

export type Member = {
  userId: string;
  email: string;
  name?: string;
  kind: 'human' | 'agent';
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
};

export type MintedAgent = {
  agent: {
    userId: string;
    name: string;
    kind: 'agent';
    role: 'owner' | 'admin' | 'member';
  };
  token: Token;
  rawToken: string;
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

export type TaskFilter = 'today' | 'upcoming' | 'all' | 'completed' | 'mine';

export type CreateTaskInput = {
  title: string;
  dueDate?: string; // YYYY-MM-DD format
  assigneeId?: string;
};

export type UpdateTaskInput = {
  title?: string;
  dueDate?: string | null; // null to clear, undefined to keep unchanged
  assigneeId?: string | null;
  listId?: string; // set or replace; clearing is a later story
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

export type AcceptInvitationResult = {
  organizationId: string;
  organizationName: string;
  role: 'admin' | 'member';
};
