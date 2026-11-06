import type { HistoryReadLogger } from '../kernel/history-read-logger.js';

type PinoWarnLogger = {
  warn: (obj: Record<string, unknown>) => void;
};

export const createPinoHistoryReadLogger = (logger: PinoWarnLogger): HistoryReadLogger => ({
  warn: (fields) => {
    logger.warn({
      msg: 'change_log_unparsed',
      recordId: fields.recordId,
      kind: fields.kind,
      reason: fields.reason,
    });
  },
});

export const silentHistoryReadLogger: HistoryReadLogger = {
  warn: () => undefined,
};
