import type { Actor } from '../../shared/auth-context.js';

export type CreateNoteCommand = {
  projectId: string;
  organizationId: string;
  title: string;
  body?: string;
  actor: Actor;
};

export type UpdateNoteCommand = {
  noteId: string;
  projectId: string;
  organizationId: string;
  title?: string;
  body?: string;
  expectedVersion: string;
  actor: Actor;
};

export type DeleteNoteCommand = {
  noteId: string;
  projectId: string;
  organizationId: string;
  actor: Actor;
};

export type ImportNoteFromObsidianCommand = {
  organizationId: string;
  projectId: string;
  noteId?: string;
  title: string;
  body: string;
  baseVersion?: string;
  actor: Actor;
};
