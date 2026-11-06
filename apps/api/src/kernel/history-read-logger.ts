export type HistoryReadLogger = {
  warn: (fields: { recordId: string; kind: string; reason: string }) => void;
};
