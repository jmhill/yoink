import type { IssueAdminSessionPlan } from './admin-session-plan.js';

/** Signs an issue plan and opens a token back to its unsigned payload. */
export type AdminSessionParticipant = {
  issue(plan: IssueAdminSessionPlan): string;
  read(token: string): unknown | null;
};
