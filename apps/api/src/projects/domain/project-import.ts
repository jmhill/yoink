import { z } from 'zod';
import { ImportProjectSchema, type ImportProject, type StagedImportStatus } from '@yoink/api-contracts';

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

export const stagedImportPayloadSchema = z.object({
  projects: z.array(ImportProjectSchema),
});
