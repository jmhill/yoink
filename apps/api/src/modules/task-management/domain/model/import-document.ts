import type { ImportEntryError } from '../messages/project-errors.js';
import type { NotebookPage, Project } from './project-document.js';

/** Staged-import documents. The module owns these shapes. Edges map them onto the contract. */

export type ImportNewTask = {
  key: string;
  title: string;
  dueDate?: string;
  assigneeId?: string;
  listId?: string;
};

export type ImportNextAction = { existingTaskId: string } | { newTaskKey: string };

export type ImportProjectStatus = 'active' | 'waiting' | 'someday' | 'done' | 'proposed';

export type ImportProject = {
  name: string;
  objective?: string;
  status: ImportProjectStatus;
  waitingOn?: string;
  waitingSince?: string | null;
  notebookPages?: string[];
  existingTaskIds?: string[];
  newTasks?: ImportNewTask[];
  nextAction?: ImportNextAction | null;
};

export type ImportPreviewWarning = {
  field: string;
  code: string;
  message: string;
};

export type ImportPreviewTask = {
  title: string;
  source: 'existing' | 'new';
  dueDate?: string | null;
  assigneeName?: string | null;
};

export type ImportPreviewProject = {
  name: string;
  objective?: string;
  status: 'active' | 'waiting' | 'someday';
  waitingOn?: string | null;
  waitingSince?: string | null;
  nextActionTitle: string | null;
  tasks: ImportPreviewTask[];
  notebookPages: NotebookPage[];
  warnings: ImportPreviewWarning[];
};

export type ImportPreviewTotals = {
  projectCount: number;
  existingTaskCount: number;
  newTaskCount: number;
  projectsWithNoNextAction: number;
};

export type ImportPreview = {
  projects: ImportPreviewProject[];
  totals: ImportPreviewTotals;
};

export const STAGED_IMPORT_STATUSES = ['pending', 'applied', 'discarded'] as const;

export type StagedImportStatus = (typeof STAGED_IMPORT_STATUSES)[number];

export type StagedImport = {
  id: string;
  status: StagedImportStatus;
  createdById: string;
  createdByName: string;
  createdAt: string;
  decidedById: string | null;
  decidedAt: string | null;
  preview: ImportPreview | null;
  errors: ImportEntryError[];
};

export type AppliedImport = {
  id: string;
  status: 'applied';
  preview: ImportPreview;
  projects: Project[];
};

export type DiscardedImport = {
  id: string;
  status: 'discarded';
  decidedById: string;
  decidedAt: string;
};
