export type CalendarDate = string;

export type WeekDates = {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
};

export type WeekUtcBounds = {
  readonly start: string;
  readonly end: string;
};

const MS_PER_DAY = 86_400_000;

const calendarParts = (date: CalendarDate): { year: number; month: number; day: number } => {
  const [year, month, day] = date.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

export const addCalendarDays = (date: CalendarDate, days: number): CalendarDate => {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  const next = new Date(parsed + days * MS_PER_DAY);
  return next.toISOString().slice(0, 10);
};

export const isCalendarMonday = (date: CalendarDate): boolean => {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return new Date(parsed).getUTCDay() === 1;
};

export const mondayOnOrBefore = (date: CalendarDate): CalendarDate => {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  const dow = new Date(parsed).getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return addCalendarDays(date, offset);
};

export const previousMonday = (monday: CalendarDate): CalendarDate => addCalendarDays(monday, -7);

export const nextMonday = (monday: CalendarDate): CalendarDate => addCalendarDays(monday, 7);

export const weekDates = (monday: CalendarDate): WeekDates => ({
  start: monday,
  end: addCalendarDays(monday, 6),
});

const zoneParts = (
  instant: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
};

const asUtcMs = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): number => Date.UTC(year, month - 1, day, hour, minute, second);

const shownOffsetMs = (utcMs: number, wanted: number, timeZone: string): number => {
  const shown = zoneParts(new Date(utcMs), timeZone);
  return (
    wanted - asUtcMs(shown.year, shown.month, shown.day, shown.hour, shown.minute, shown.second)
  );
};

/**
 * UTC instant for local midnight on `date` in `timeZone`. Two-pass offset
 * correction so DST spring-forward / fall-back weeks stay half-open
 * [Monday 00:00, next Monday 00:00).
 */
export const localMidnightUtc = (date: CalendarDate, timeZone: string): string => {
  const { year, month, day } = calendarParts(date);
  const wanted = asUtcMs(year, month, day, 0, 0, 0);
  const afterFirst = wanted + shownOffsetMs(wanted, wanted, timeZone);
  const afterSecond = afterFirst + shownOffsetMs(afterFirst, wanted, timeZone);
  return new Date(afterSecond).toISOString();
};

export const weekUtcBounds = (monday: CalendarDate, timeZone: string): WeekUtcBounds => ({
  start: localMidnightUtc(monday, timeZone),
  end: localMidnightUtc(nextMonday(monday), timeZone),
});

export const compareCalendarDates = (left: CalendarDate, right: CalendarDate): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

export const formatCalendarDate = (year: number, month: number, day: number): CalendarDate =>
  `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
