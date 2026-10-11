import { err, ok, type Result } from 'neverthrow';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const parseIsoDate = (raw: string): Result<string, 'INVALID_ISO_DATE'> => {
  const match = ISO_DATE.exec(raw);
  if (!match) {
    return err('INVALID_ISO_DATE');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return err('INVALID_ISO_DATE');
  }

  return ok(raw);
};
