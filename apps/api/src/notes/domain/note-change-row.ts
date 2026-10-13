export type NoteChangeRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly title: string;
  readonly body: string;
  readonly version: string;
  readonly createdAt: string;
  readonly createdById: string;
  readonly createdByName: string;
  readonly updatedAt: string;
  readonly updatedById: string;
  readonly updatedByName: string;
  readonly deletedAt: string | null;
};
