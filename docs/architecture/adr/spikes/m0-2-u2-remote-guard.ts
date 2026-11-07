/**
 * Gates and redaction for the M0.2 remote runner.
 * This module does not open a connection and does not read the environment.
 */

export const REMOTE_TARGET = 'libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io';
export const REMOTE_HOSTNAME = 'yoink-m02-spike-jmhill.aws-us-east-1.turso.io';
/** Turso database id of yoink-m02-spike. Not a group id. */
export const AUTHORIZED_DATABASE_ID = '01a1b366-ad01-751d-bbab-7852a143f84b';
export const LIBSQL_VERSION = '0.15.15';
export const TOKEN_ENV = 'TURSO_SPIKE_AUTH_TOKEN';

const INDEX_KEYS = ['index', 'statementIndex', 'stmtIndex', 'statement_index'] as const;

export class RemoteTargetRejected extends Error {
  readonly code = 'REMOTE_TARGET_REJECTED';

  constructor() {
    super('REMOTE_TARGET_REJECTED');
    this.name = 'RemoteTargetRejected';
  }
}

/** Reject every URL except the one spike host. No network. */
export const assertRemoteTarget = (url: string): void => {
  if (url !== REMOTE_TARGET) throw new RemoteTargetRejected();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RemoteTargetRejected();
  }
  if (parsed.protocol !== 'libsql:') throw new RemoteTargetRejected();
  if (parsed.username !== '' || parsed.password !== '') throw new RemoteTargetRejected();
  if (parsed.port !== '') throw new RemoteTargetRejected();
  if (parsed.hostname !== REMOTE_HOSTNAME) throw new RemoteTargetRejected();
  if (parsed.pathname !== '' && parsed.pathname !== '/') throw new RemoteTargetRejected();
  if (parsed.search !== '' || parsed.hash !== '') throw new RemoteTargetRejected();
  if (parsed.hostname.includes('jhtc-yoink') || parsed.hostname.includes('yoink-prod')) {
    throw new RemoteTargetRejected();
  }
};

const primitiveCode = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value;
  return null;
};

const readIndex = (value: object): number | null => {
  for (const key of INDEX_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = (value as Record<string, unknown>)[key];
    if (typeof found === 'number' && Number.isFinite(found)) return found;
  }
  return null;
};

/**
 * Keep code, rawCode, and a numeric statement index when the client actually
 * provides one. Messages, stacks, URLs, and cause text are dropped.
 */
export const sanitizeError = (error: unknown): { code: string | number | null; rawCode: string | number | null; index: number | null; cause: { code: string | number | null; rawCode: string | number | null; index: number | null } | null } => {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) {
    return { code: null, rawCode: null, index: null, cause: null };
  }
  const value = error as { code?: unknown; rawCode?: unknown; cause?: unknown };
  const cause =
    value.cause !== null && (typeof value.cause === 'object' || typeof value.cause === 'function')
      ? {
          code: primitiveCode((value.cause as { code?: unknown }).code),
          rawCode: primitiveCode((value.cause as { rawCode?: unknown }).rawCode),
          index: readIndex(value.cause as object),
        }
      : null;
  return {
    code: primitiveCode(value.code),
    rawCode: primitiveCode(value.rawCode),
    index: readIndex(error),
    cause,
  };
};

export const redactSecrets = (text: string, secrets: readonly string[]): { text: string; redacted: boolean } => {
  let out = text;
  let redacted = false;
  for (const secret of secrets) {
    if (secret.length === 0 || !out.includes(secret)) continue;
    out = out.split(secret).join('[redacted]');
    redacted = true;
  }
  return { text: out, redacted };
};
