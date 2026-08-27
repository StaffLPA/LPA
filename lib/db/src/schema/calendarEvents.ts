import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const calendarEventsTable = pgTable("calendar_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  location: text("location").notNull(),
  team: text("team").notNull(),
  repeatSeriesId: text("repeat_series_id"),
  repeatUntil: text("repeat_until"),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  teamDateIndex: index("calendar_events_team_date_idx").on(table.team, table.date, table.time),
  dateIndex: index("calendar_events_date_idx").on(table.date, table.time),
  repeatSeriesDateIndex: index("calendar_events_repeat_series_date_idx").on(table.repeatSeriesId, table.date),
}));

export const insertCalendarEventSchema = createInsertSchema(calendarEventsTable).omit({ createdAt: true, updatedAt: true });
export type CalendarEvent = z.infer<typeof insertCalendarEventSchema>;