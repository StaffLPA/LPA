/** Normalize manual input to the calendar API's 12-hour format without rounding. */
export function normalizeCalendarTime(input: string): string | null {
  const value = input.trim();
  const twelveHour = /^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i.exec(value);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return `${hour}:${twelveHour[2]} ${twelveHour[3].toUpperCase()}M`;
  }
  const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!twentyFourHour) return null;
  const hour = Number(twentyFourHour[1]);
  const minute = Number(twentyFourHour[2]);
  if (hour > 23 || minute > 59) return null;
  return `${hour % 12 || 12}:${twentyFourHour[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export const calendarTimeSlots = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = String((index % 2) * 30).padStart(2, '0');
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
});
