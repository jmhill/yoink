export type ListNotesQuery = {
  projectId: string;
  organizationId: string;
  limit?: number;
  cursor?: string;
};

export type GetNoteQuery = {
  noteId: string;
  projectId: string;
  organizationId: string;
};
