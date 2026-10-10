export const localDateString = (now = new Date()): string => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const waitingDayCount = (waitingSince: string, today: string): number => {
  const start = Date.parse(`${waitingSince}T00:00:00`);
  const end = Date.parse(`${today}T00:00:00`);
  return Math.round((end - start) / 86_400_000);
};

export const formatWaitingSinceLabel = (waitingSince: string): string =>
  new Date(`${waitingSince}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

export type WaitingLineParts =
  | { kind: 'unknown'; who: string }
  | { kind: 'known'; who: string; dateLabel: string; days: number };

/**
 * Approved #137 waiting-line copy, used by #136 on the current page.
 * Known since: "Waiting on {who} since {Mon D} ({n} days)"
 * Unknown: "Waiting on {who} · since unknown"
 */
export const waitingLineParts = (input: {
  waitingOn: string;
  waitingSince: string | null;
  today: string;
}): WaitingLineParts => {
  if (!input.waitingSince) {
    return { kind: 'unknown', who: input.waitingOn };
  }

  return {
    kind: 'known',
    who: input.waitingOn,
    dateLabel: formatWaitingSinceLabel(input.waitingSince),
    days: waitingDayCount(input.waitingSince, input.today),
  };
};

export const formatWaitingLine = (input: {
  waitingOn: string;
  waitingSince: string | null;
  today: string;
}): string => {
  const parts = waitingLineParts(input);
  if (parts.kind === 'unknown') {
    return `Waiting on ${parts.who} · since unknown`;
  }

  const dayLabel = parts.days === 1 ? '1 day' : `${parts.days} days`;
  return `Waiting on ${parts.who} since ${parts.dateLabel} (${dayLabel})`;
};
