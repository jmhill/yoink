export type ReportFastifyErrorQuery = {
  error: unknown;
  replyStatusCode: number;
};

export type ReportFastifyErrorResult = {
  report: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const statusCodeFromError = (error: unknown): number | undefined => {
  if (!isRecord(error)) {
    return undefined;
  }
  const status = error.statusCode ?? error.status;
  return typeof status === 'number' ? status : undefined;
};

const isClientHttpError = (error: unknown): boolean => {
  const status = statusCodeFromError(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return true;
  }
  if (!isRecord(error)) {
    return false;
  }
  if (error.name === 'RequestValidationError') {
    return true;
  }
  return typeof error.message === 'string' && error.message.startsWith('Rate limit exceeded');
};

/**
 * Report only server failures. Validation 400s and rate-limit 429s are
 * client/traffic conditions, not crashes — including when Fastify has not
 * copied the status onto `reply` yet.
 */
export const decideShouldReportFastifyError = (
  query: ReportFastifyErrorQuery
): ReportFastifyErrorResult => {
  if (isClientHttpError(query.error)) {
    return { report: false };
  }
  const status = statusCodeFromError(query.error) ?? query.replyStatusCode;
  if (status >= 400 && status < 500) {
    return { report: false };
  }
  return { report: status >= 500 || status < 400 };
};

export const shouldHandleError = (
  error: Error,
  _request: unknown,
  reply: { statusCode: number }
): boolean =>
  decideShouldReportFastifyError({
    error,
    replyStatusCode: reply.statusCode,
  }).report;
