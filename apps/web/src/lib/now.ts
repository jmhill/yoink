import { memberLabel } from '@/api/auth';
import type { Member } from '@yoink/api-contracts';

export const localDateLabel = (now: Date, timeZone?: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  return `${weekday} ${month} ${day}`;
};

export const nowSubcopy = (input: {
  localDate: string;
  nextActionCount: number;
  dueCount: number;
}): string => {
  const next =
    input.nextActionCount === 1 ? '1 next action' : `${input.nextActionCount} next actions`;
  const due = input.dueCount === 1 ? '1 due' : `${input.dueCount} due`;
  return `${input.localDate} · ${next} · ${due}`;
};

export const listsRowLabel = (namedListCount: number): string =>
  namedListCount === 1 ? '1 list' : `${namedListCount} lists`;

export const ownerLabelFor = (
  task: { assigneeId?: string },
  viewerId: string | undefined,
  members: readonly Pick<Member, 'userId' | 'email' | 'name' | 'kind'>[]
): string | undefined => {
  if (!task.assigneeId || task.assigneeId === viewerId) {
    return undefined;
  }
  const member = members.find((item) => item.userId === task.assigneeId);
  if (!member) {
    return undefined;
  }
  return memberLabel(member);
};
