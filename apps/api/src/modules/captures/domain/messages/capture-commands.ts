import type { Actor } from '../../../../kernel/auth-context.js';
import type { CaptureStatus } from '../model/capture.js';

export type CreateCaptureCommand = {
  content: string;
  title?: string;
  sourceUrl?: string;
  sourceApp?: string;
  organizationId: string;
  createdById: string;
  actor: Actor;
};

export type ListCapturesQuery = {
  organizationId: string;
  status?: CaptureStatus;
  snoozed?: boolean; // true = only snoozed, false = exclude snoozed
  limit?: number;
  cursor?: string;
};

export type FindCaptureQuery = {
  id: string;
  organizationId: string;
};

// Content-only updates - explicit commands handle status/pin/snooze
export type UpdateCaptureCommand = {
  id: string;
  organizationId: string;
  title?: string;
  content?: string;
  actor: Actor;
};

// Workflow operations
export type TrashCaptureCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

export type RestoreCaptureCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

// Display modifier operations
export type SnoozeCaptureCommand = {
  id: string;
  organizationId: string;
  until: string; // ISO datetime when snooze expires
  actor: Actor;
};

export type UnsnoozeCaptureCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

// Deletion operations
export type DeleteCaptureCommand = {
  id: string;
  organizationId: string;
  actor: Actor;
};

export type EmptyTrashCommand = {
  organizationId: string;
  actor: Actor;
};

// Processing operations
export type ProcessCaptureToTaskCommand = {
  id: string;
  organizationId: string;
  createdById: string;
  title?: string; // Defaults to capture content (first 500 chars)
  dueDate?: string; // YYYY-MM-DD format
  listId?: string; // optional single list bucket; omit for unlisted
  projectId?: string; // optional project; omit for no project
  actor: Actor;
};

export type ProcessCaptureToProjectCommand = {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  objective?: string;
  status: 'active' | 'someday';
  actor: Actor;
};
