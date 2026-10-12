export const calendarDaysBetween = (today: string, date: string): number => {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  const end = Date.parse(`${today}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
};
