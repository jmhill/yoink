import type { AdminSessionCrypto } from '../domain/admin-session-crypto.js';
import type { AdminSessionParticipant } from '../domain/admin-session-participant.js';
import { isIssueAdminSessionPlan, type IssueAdminSessionPlan } from '../domain/admin-session-plan.js';

/** Token text is `base64url(session JSON).hmac`. No SQL. */
export const createAdminSessionParticipant = (
  crypto: AdminSessionCrypto
): AdminSessionParticipant => ({
  issue(plan: IssueAdminSessionPlan) {
    if (!isIssueAdminSessionPlan(plan)) {
      throw new Error('not an admin session plan');
    }
    const payload = Buffer.from(JSON.stringify(plan.session)).toString('base64url');
    return `${payload}.${crypto.sign(payload)}`;
  },

  read(token: string) {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }
    const [payload, signature] = parts;
    if (payload === undefined || signature === undefined || !crypto.signatureMatches(payload, signature)) {
      return null;
    }
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    } catch {
      return null;
    }
  },
});
