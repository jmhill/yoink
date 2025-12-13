import type { Capture } from '@yoink/api-contracts';

export type FindByOrganizationOptions = {
  organizationId: string;
  status?: 'inbox' | 'archived';
  limit?: number;
  cursor?: string;
};

export type FindByOrganizationResult = {
  captures: Capture[];
  nextCursor?: string;
};

export type CaptureStore = {
  save(capture: Capture): Promise<void>;
  findByOrganization(
    options: FindByOrganizationOptions
  ): Promise<FindByOrganizationResult>;
};
