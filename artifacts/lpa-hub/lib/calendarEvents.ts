export type CalendarEvent = {
  id: string; date: string; endDate?: string; time: string; endTime?: string; title: string;
  location: string; locationAddress?: string | null; notes?: string | null; tag: string; team: string; tint: string;
};
export type TeamResolver = {
  canonicalTeam: (team: string) => string;
  tagLabel: (team: string) => string;
  teamColor: (team: string) => string;
};

export function filterCalendarEventsByTeamVisibility<T extends { team: string }>(
  events: T[],
  isTeamHidden: (team: string) => boolean,
) {
  return events.filter((event) => !isTeamHidden(event.team));
}

export const dateFromKey = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};
const startTimeMinutes = (time: string) => {
  const start = time.trim().split(/\s*[-–—]\s*/, 2)[0];
  const twelveHour = start.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    if (twelveHour[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (twelveHour[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
    return hours * 60 + Number(twelveHour[2]);
  }
  const twentyFourHour = start.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return twentyFourHour ? Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]) : null;
};
export const calendarEventTimestamp = (date: string, time: string) => {
  const day = dateFromKey(date);
  const minutes = startTimeMinutes(time);
  if (minutes === null) day.setHours(12, 0, 0, 0);
  else day.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return day.getTime();
};
const normalizedEventPart = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
type UpcomingEvent = { id: string; date: string; time: string; title: string; location: string; team: string };

export function getUpcomingCalendarEvents<T extends UpcomingEvent>(
  events: T[],
  assignedTeams: string[],
  canonicalizeTeam: (team: string) => string,
  now = Date.now(),
  limit = 3,
): T[] {
  const allowedTeams = new Set(assignedTeams.map(canonicalizeTeam));
  const candidates = events
    .map((event) => ({
      event,
      team: canonicalizeTeam(event.team),
      timestamp: calendarEventTimestamp(event.date, event.time),
      identity: [
        event.date,
        startTimeMinutes(event.time) ?? normalizedEventPart(event.time),
        normalizedEventPart(event.title),
        normalizedEventPart(event.location),
      ].join('\u0000'),
    }))
    .filter((candidate) => candidate.timestamp >= now && (candidate.team === 'LPA' || allowedTeams.has(candidate.team)))
    .sort((a, b) => a.timestamp - b.timestamp);

  const unique: typeof candidates = [];
  const seenIds = new Set<string>();
  for (const candidate of candidates) {
    if (seenIds.has(candidate.event.id)) continue;
    seenIds.add(candidate.event.id);
    const duplicateIndex = unique.findIndex((existing) =>
      existing.identity === candidate.identity &&
      (existing.team === candidate.team || existing.team === 'LPA' || candidate.team === 'LPA'),
    );
    if (duplicateIndex === -1) {
      unique.push(candidate);
    } else if (unique[duplicateIndex].team === 'LPA' && candidate.team !== 'LPA') {
      // Keep the team-specific label when the same event is listed on both calendars.
      unique[duplicateIndex] = candidate;
    }
  }

  return unique.sort((a, b) => a.timestamp - b.timestamp).slice(0, limit).map(({ event }) => event);
}
export const dateRangeLabel = (startDate: string, endDate = startDate) => {
  const start = dateFromKey(startDate);
  const end = dateFromKey(endDate);
  if (startDate === endDate) return start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
};
export const timeRangeLabel = (event: Pick<CalendarEvent, 'time' | 'endTime'>) => event.endTime && event.endTime !== 'Time TBD' && event.endTime !== event.time
  ? `${event.time} – ${event.endTime}`
  : event.time;
export const formatIcsTime = (value: string | undefined) => {
  const match = value?.match(/T(\d{2})(\d{2})/);
  if (!match) return 'Time TBD';
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
};
export const unescapeIcs = (value: string) => value.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1');

const LEGACY_DESCRIPTION = /(^|\n|\s)·\s*Updated\b/i;
const clean = (value: string | undefined) => {
  const text = value ? unescapeIcs(value).trim() : '';
  return text || undefined;
};

export function parseIcsEvents(feed: string | undefined, resolver: TeamResolver, fallbackTeam = ''): CalendarEvent[] {
  if (!feed) return [];
  const events: CalendarEvent[] = [];
  let values: Record<string, string> | null = null;
  for (const line of feed.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') { values = {}; continue; }
    if (line === 'END:VEVENT' && values) {
      const startsAt = values.DTSTART;
      const date = startsAt?.match(/^(\d{4})(\d{2})(\d{2})/)?.slice(1).join('-');
      const endDate = values.DTEND?.match(/^(\d{4})(\d{2})(\d{2})/)?.slice(1).join('-');
      const rawTeam = values['X-LPA-TEAM'] ?? values.CATEGORIES ?? fallbackTeam;
      const team = resolver.canonicalTeam(unescapeIcs(rawTeam));
      const description = clean(values.DESCRIPTION);
       const notes = 'X-LPA-NOTES' in values
         ? clean(values['X-LPA-NOTES']) ?? null
         : description && !LEGACY_DESCRIPTION.test(description) ? description : undefined;
      if (date && values.UID && values.SUMMARY) events.push({
        id: values.UID.replace(/@lpahub$/, ''),
        date,
        endDate: endDate && endDate !== date ? endDate : undefined,
        time: formatIcsTime(startsAt),
        endTime: formatIcsTime(values.DTEND),
        title: unescapeIcs(values.SUMMARY),
        location: unescapeIcs(values.LOCATION ?? 'LPA Campus'),
         locationAddress: 'X-LPA-LOCATION-ADDRESS' in values ? clean(values['X-LPA-LOCATION-ADDRESS']) ?? null : undefined,
        notes,
        tag: resolver.tagLabel(team),
        team,
        tint: resolver.teamColor(team),
      });
      values = null;
      continue;
    }
    if (!values) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    values[line.slice(0, separator).split(';', 1)[0]] = line.slice(separator + 1);
  }
  return events;
}

/** Later feeds override earlier ones by id; fields missing in the later copy are kept from the earlier one. */
export function mergeEvents(lists: CalendarEvent[][]): CalendarEvent[] {
  const merged = new Map<string, CalendarEvent>();
  for (const list of lists) for (const event of list) {
    const prev = merged.get(event.id);
    merged.set(event.id, prev ? { ...event, locationAddress: event.locationAddress !== undefined ? event.locationAddress : prev.locationAddress, notes: event.notes !== undefined ? event.notes : prev.notes } : event);
  }
  return [...merged.values()];
}
