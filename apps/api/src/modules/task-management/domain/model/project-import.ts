import type { ImportProject, StagedImportStatus } from './import-document.js';

export type ProjectImportRecord = {
  id: string;
  organizationId: string;
  createdById: string;
  createdAt: string;
  status: StagedImportStatus;
  projects: ImportProject[];
  decidedById: string | null;
  decidedAt: string | null;
};
