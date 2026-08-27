import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const guardianLinksTable = pgTable("guardian_links", {
  id: text("id").primaryKey(),
  athleteId: text("athlete_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  guardianId: text("guardian_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  athleteGuardianUnique: uniqueIndex("guardian_links_athlete_guardian_unique").on(table.athleteId, table.guardianId),
  athleteIndex: index("guardian_links_athlete_idx").on(table.athleteId),
  guardianIndex: index("guardian_links_guardian_idx").on(table.guardianId),
}));

export const insertGuardianLinkSchema = createInsertSchema(guardianLinksTable).omit({ createdAt: true });
export type InsertGuardianLink = z.infer<typeof insertGuardianLinkSchema>;
export type GuardianLink = typeof guardianLinksTable.$inferSelect;