export type PublishMode = 'now' | 'later';
const pad = (value: number) => String(value).padStart(2, '0');

export function localDateString(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTimeString(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses local wall-clock parts (YYYY-MM-DD, HH:MM) into a Date, or null if invalid. */
export function localPartsToDate(dateValue: string, timeValue: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const [hours, minutes] = [Number(timeMatch[1]), Number(timeMatch[2])];
  if (hours > 23 || minutes > 59) return null;
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function scheduleProblem(date: Date | null, now = new Date()) {
  if (!date) return 'Choose a valid date and time.';
  if (date.getTime() <= now.getTime() + 30_000) return 'Pick a date and time in the future.';
  return null;
}

/** UTC ISO string sent to the API. */
export function toUtcIso(date: Date) {
  return date.toISOString();
}

export function defaultScheduleDate(now = new Date()) {
  const next = new Date(now.getTime() + 60 * 60_000);
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15, 0, 0);
  return next;
}

export function shiftLocal(dateValue: string, timeValue: string, minutes: number) {
  const base = localPartsToDate(dateValue, timeValue) ?? defaultScheduleDate();
  const next = new Date(base.getTime() + minutes * 60_000);
  return { date: localDateString(next), time: localTimeString(next) };
}

export function timeZoneLabel(date: Date) {
  try {
    const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date).find((item) => item.type === 'timeZoneName');
    if (part?.value) return part.value;
  } catch { /* fall through */ }
  const offset = -date.getTimezoneOffset();
  return `GMT${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

export function formatScheduleLabel(value: string | Date | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const text = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${text} ${timeZoneLabel(date)}`;
}

/** Combines a native picker's date OR time choice with the other half of the current value. */
export function mergeNativePick(current: Date, picked: Date, mode: 'date' | 'time') {
  const next = new Date(current.getTime());
  if (mode === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}
