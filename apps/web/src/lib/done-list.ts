import type { DoneListGroup, DoneListPage } from '@yoink/api-contracts';

export const formatDoneWeekRange = (start: string, end: string): string => {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const startMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(startDate);
  const endMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(endDate);
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} – ${endDay}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
};

export const formatDoneTaskWhen = (
  completedAt: string,
  timeZone: string,
  completedByName?: string
): string => {
  const instant = new Date(completedAt);
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone,
  }).format(instant);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  })
    .format(instant)
    .replace(/\s/g, '')
    .toLowerCase();
  if (completedByName === undefined || completedByName.length === 0) {
    return `${weekday} ${time}`;
  }
  return `${weekday} ${time} · ${completedByName}`;
};

export const doneOtherLine = (count: number): string =>
  count === 1 ? 'Plus 1 task not in a project' : `Plus ${count} tasks not in a project`;

export const doneVersionOf = (page: DoneListPage): string =>
  [
    page.week.start,
    page.otherTaskCount,
    ...page.groups.map(
      (group) =>
        `${group.project.id}:${group.nextAction?.id ?? ''}:${group.tasks.map((task) => task.id).join(',')}`
    ),
  ].join('|');

export const canSetDoneNextAction = (group: DoneListGroup): boolean =>
  (group.project.status === 'active' || group.project.status === 'waiting') &&
  group.nextAction === null;

export const showsDoneProjectChip = (group: DoneListGroup): boolean =>
  group.project.status === 'done';
