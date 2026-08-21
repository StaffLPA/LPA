import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { calendarEventsTable, db } from "@workspace/db";
import { requireAdmin, requireSession } from "../lib/auth";

const router: IRouter = Router();
const value = (input: unknown) => typeof input === "string" && input.trim() ? input.trim() : null;
const mapEvent = (event: typeof calendarEventsTable.$inferSelect) => ({ ...event, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString() });
const validDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};
const timeValuePattern = `(?:(?:[1-9]|1[0-2]):[0-5]\\d\\s(?:AM|PM)|(?:[01]\\d|2[0-3]):[0-5]\\d)`;
const validTime = (time: string) => new RegExp(`^${timeValuePattern}(?:\\s-\\s${timeValuePattern})?$`).test(time);
const timeParts = (time: string) => time.split(/\s-\s/, 2);
const feedTeams: Record<string, { label: string; dbTeam: string }> = {
  "15u": { label: "15u", dbTeam: "15u" },
  "14u": { label: "14u", dbTeam: "14u" },
  "lpa-jv": { label: "LPA JV", dbTeam: "Junior Varsity" },
  varsity: { label: "Varsity", dbTeam: "Varsity" },
  "lpa-events": { label: "LPA Events", dbTeam: "LPA Events" },
};
const eventTeamAliases: Record<string, string[]> = {
  "LPA 14U": ["LPA 14U", "14u"],
  "LPA 15U": ["LPA 15U", "15u"],
  "LPA JV": ["LPA JV", "Junior Varsity"],
  "LPA Varsity": ["LPA Varsity", "Varsity"],
  LPA: ["LPA", "LPA Events"],
};
function eventIsForUser(eventTeam: string, teams: string[]) {
  if (eventTeam === "LPA Events") return true;
  return teams.some((team) => (eventTeamAliases[team] ?? [team]).includes(eventTeam));
}
const icsEscape = (input: string) => input.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
const toIcsDateTime = (date: string, time: string) => {
  const match = time.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
  if (!match) return `${date.replace(/-/g, "")}T120000`;
  let hour = Number(match[1]);
  if (match[3].toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (match[3].toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${date.replace(/-/g, "")}T${String(hour).padStart(2, "0")}${match[2]}00`;
};
const addOneHour = (dateTime: string) => {
  const hour = Number(dateTime.slice(9, 11));
  return `${dateTime.slice(0, 9)}${String((hour + 1) % 24).padStart(2, "0")}${dateTime.slice(11)}`;
};
function calendarFeed(events: Array<typeof calendarEventsTable.$inferSelect>, label: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Legendary Prep Academy//LPA Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(`LPA Hub · ${label}`)}`,
    "X-WR-TIMEZONE:America/Phoenix",
  ];
  for (const event of events) {
    const [startTime, endTime] = timeParts(event.time);
    const start = toIcsDateTime(event.date, startTime);
    const end = endTime ? toIcsDateTime(event.date, endTime) : addOneHour(start);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@lpahub`,
      `DTSTAMP:${event.updatedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART;TZID=America/Phoenix:${start}`,
      `DTEND;TZID=America/Phoenix:${end}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `LOCATION:${icsEscape(event.location)}`,
      `DESCRIPTION:${icsEscape(`${label} · Updated ${event.updatedAt.toISOString()}`)}`,
      `LAST-MODIFIED:${event.updatedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `SEQUENCE:${Math.floor(event.updatedAt.getTime() / 1000)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
function eventInput(body: Record<string, unknown>) {
  const title = value(body.title), date = value(body.date), time = value(body.time), location = value(body.location) ?? "LPA Campus", team = value(body.team) ?? "LPA Events";
  if (!title || !date || !time) return { error: "Title, date, and start time are required." };
  if (!validDate(date)) return { error: "Use a valid date in YYYY-MM-DD format." };
  if (!validTime(time)) return { error: "Use a time such as 4:00 PM or a range such as 4:00 PM - 12:00 PM." };
  return { data: { title, date, time, location, team } };
}

router.get("/calendar-events", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  const team = value(req.query.team);
  const events = await db.select().from(calendarEventsTable).where(team ? eq(calendarEventsTable.team, team) : undefined).orderBy(desc(calendarEventsTable.date), desc(calendarEventsTable.time));
  const visible = user.role === "Admin" && !user.teams.length ? events : events.filter((event) => eventIsForUser(event.team, user.teams));
  res.json(visible.map(mapEvent));
});

// Public subscription feeds. The feed contains only the selected team's schedule
// so staff and families can subscribe from Apple/Google/Outlook calendars.
router.get("/calendar.ics", async (req, res) => {
  const slug = value(req.query.team)?.toLowerCase() ?? "";
  const feed = feedTeams[slug];
  if (!feed) {
    res.status(404).type("text").send("Unknown calendar feed.");
    return;
  }
  const events = await db.select().from(calendarEventsTable)
    .where(eq(calendarEventsTable.team, feed.dbTeam))
    .orderBy(calendarEventsTable.date, calendarEventsTable.time);
  res.set({
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `inline; filename="lpa-${slug}.ics"`,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  }).send(calendarFeed(events, feed.label));
});

router.get("/admin/calendar-events", async (req, res) => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  const team = value(req.query.team);
  const events = await db.select().from(calendarEventsTable).where(team ? eq(calendarEventsTable.team, team) : undefined).orderBy(desc(calendarEventsTable.date), desc(calendarEventsTable.time));
  res.json(events.map(mapEvent));
});

router.post("/admin/calendar-events", async (req, res) => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  const input = eventInput(req.body);
  if ("error" in input) { res.status(400).json({ message: input.error }); return; }
  const [event] = await db.insert(calendarEventsTable).values({ id: randomBytes(16).toString("hex"), ...input.data, createdBy: user.id }).returning();
  res.status(201).json(mapEvent(event));
});

router.patch("/admin/calendar-events/:id", async (req, res) => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  const [existing] = await db.select().from(calendarEventsTable).where(eq(calendarEventsTable.id, req.params.id));
  if (!existing) { res.status(404).json({ message: "Calendar event not found." }); return; }
  const input = eventInput(req.body);
  if ("error" in input) { res.status(400).json({ message: input.error }); return; }
  const [event] = await db.update(calendarEventsTable).set({
    ...input.data,
    updatedAt: new Date(),
  }).where(eq(calendarEventsTable.id, existing.id)).returning();
  res.json(mapEvent(event));
});

router.delete("/admin/calendar-events/:id", async (req, res) => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  const [event] = await db.delete(calendarEventsTable).where(eq(calendarEventsTable.id, req.params.id)).returning();
  if (!event) { res.status(404).json({ message: "Calendar event not found." }); return; }
  res.status(204).send();
});

export default router;