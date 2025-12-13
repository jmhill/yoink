import type { Organization } from './organization.js';

export type OrganizationStore = {
  save(organization: Organization): Promise<void>;
  findById(id: string): Promise<Organization | null>;
};
