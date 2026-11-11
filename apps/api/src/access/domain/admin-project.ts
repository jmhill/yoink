/**
 * Project fields the admin back-date command returns. Task Management owns
 * the row. The edge copies this document onto the contract project.
 */
export type AdminProject = {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  status: 'active' | 'waiting' | 'someday' | 'done' | 'proposed' | 'declined';
  waitingOn: string | null;
  waitingSince: string | null;
  nextActionTaskId: string | null;
  notebookPages: { path: string; url: string }[];
  createdAt: string;
  lastChangedAt: string | null;
  lastChangedBy: string | null;
  objective?: string;
  reason?: string;
  suggestedNextAction?: string;
};
