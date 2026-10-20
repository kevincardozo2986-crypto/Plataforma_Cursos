const DAY = 86_400_000;
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function dayOf(date: Date): number {
  const parts = formatter.formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)!.value);
  return Date.UTC(value('year'), value('month') - 1, value('day')) / DAY;
}
export function studyStreak(dates: Date[], now = new Date()) {
  const today = dayOf(now);
  const studied = new Set(dates.map(dayOf).filter((day) => day <= today));
  let cursor = studied.has(today) ? today : today - 1;
  let days = 0;
  while (studied.has(cursor)) {
    days++;
    cursor--;
  }
  const monday = today - ((new Date(today * DAY).getUTCDay() + 6) % 7);
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = monday + index;
    return {
      date: new Date(day * DAY).toISOString().slice(0, 10),
      completed: studied.has(day),
      today: day === today,
    };
  });
  return { days, studiedToday: studied.has(today), week };
}
