export type TursoFailureClass = 'connection' | 'query';

const CONNECTION_NAMES = new Set<string>([
  'AbortError',
  'TimeoutError',
  'TursoCallTimeoutError',
]);

const CONNECTION_CODES = new Set<string>([
  'TURSO_CALL_TIMEOUT',
  'ABORT_ERR',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'HRANA_CLOSED_ERROR',
  'HRANA_WEBSOCKET_ERROR',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown, key: string): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
};

const readNumber = (value: unknown, key: string): number | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === 'number' ? field : undefined;
};

const readCause = (value: unknown): unknown => {
  if (!isRecord(value) || !('cause' in value)) {
    return undefined;
  }
  return value.cause;
};

const httpStatus = (error: unknown): number | undefined => {
  const direct = readNumber(error, 'status');
  if (direct !== undefined) {
    return direct;
  }
  return readNumber(readCause(error), 'status');
};

const messageLooksLikeConnectionLoss = (message: string): boolean =>
  message.includes('fetch failed') ||
  message.includes('timed out') ||
  message.includes('econnreset') ||
  message.includes('connection reset');

const isSqlCode = (code: string): boolean => code.startsWith('SQLITE_');

const isConnectionFailure = (error: unknown): boolean => {
  const name = readString(error, 'name');
  if (name !== undefined && CONNECTION_NAMES.has(name)) {
    return true;
  }

  const code = readString(error, 'code');
  if (code === 'SERVER_ERROR') {
    const status = httpStatus(error);
    return status === undefined || status >= 500;
  }
  if (code !== undefined && CONNECTION_CODES.has(code)) {
    return true;
  }
  if (code !== undefined && isSqlCode(code)) {
    return false;
  }

  const message = readString(error, 'message');
  return message !== undefined && messageLooksLikeConnectionLoss(message.toLowerCase());
};

/** Connection losses can be retried on a read. SQL and client errors are not. */
export const classifyTursoFailure = (error: unknown): TursoFailureClass => {
  const second = readCause(error);
  const third = second === undefined ? undefined : readCause(second);
  if (isConnectionFailure(error)) {
    return 'connection';
  }
  if (second !== undefined && isConnectionFailure(second)) {
    return 'connection';
  }
  if (third !== undefined && isConnectionFailure(third)) {
    return 'connection';
  }
  return 'query';
};
