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
