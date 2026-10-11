import type { HistoryReadLogger } from '../history/application/ports.js';

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
