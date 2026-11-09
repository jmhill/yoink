import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { AdminSession } from '../domain/admin-session.js';
import type { AdminSessionCrypto } from '../domain/admin-session-crypto.js';
import type { AdminSessionParticipant } from '../domain/admin-session-participant.js';
import { decideAdminLogin, decideAdminSession } from '../domain/decide-admin-session.js';
import { planAdminSession } from '../domain/admin-session-plan.js';

export type AdminSessionServiceDependencies = {
  adminPassword: string;
  clock: Clock;
  crypto: AdminSessionCrypto;
  participant: AdminSessionParticipant;
  sessionTtlMs?: number;
  idGenerator?: IdGenerator;
};

export type AdminSessionService = {
  login(password: string): { success: boolean; sessionToken?: string };
  verifySession(sessionToken: string): AdminSession | null;
  createSessionToken(): string;
};

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Login and verify are decisions. SHA-256 and HMAC stay on `crypto`.
 * The participant turns an issue plan into the cookie token.
 */
export const createAdminSessionService = (
  deps: AdminSessionServiceDependencies
): AdminSessionService => {
  const {
    adminPassword,
    clock,
    crypto,
    participant,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    idGenerator,
  } = deps;
  const adminPasswordDigest = crypto.digest(adminPassword);

  const issueAt = (now: string, sessionId: string | undefined): string =>
    participant.issue(
      planAdminSession({
        now,
        ...(sessionId === undefined ? {} : { sessionId }),
      })
    );

  return {
    login(password: string) {
      const passwordMatches = crypto.digestsMatch(crypto.digest(password), adminPasswordDigest);
      const sessionId = passwordMatches ? idGenerator?.generate() : undefined;
      const decision = decideAdminLogin({
        passwordMatches,
        now: passwordMatches ? clock.now().toISOString() : '',
        ...(sessionId === undefined ? {} : { sessionId }),
      });
      if (decision.isErr()) {
        return { success: false };
      }
      return { success: true, sessionToken: participant.issue(decision.value) };
    },

    verifySession(sessionToken: string) {
      const candidate = participant.read(sessionToken);
      if (candidate === null) {
        return null;
      }
      const decision = decideAdminSession({
        candidate,
        nowMs: clock.now().getTime(),
        ttlMs: sessionTtlMs,
      });
      return decision.isOk() ? decision.value : null;
    },

    createSessionToken() {
      const sessionId = idGenerator?.generate();
      return issueAt(clock.now().toISOString(), sessionId);
    },
  };
};
