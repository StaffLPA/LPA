import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const announcementAudienceTags = ["Staff-Coach", "Parent", "Student"] as const;
export const announcementStatuses = ["active", "expired", "removed"] as const;

export const announcementsTable = pgTable("announcements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  durationDays: integer("duration_days"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  audienceTags: text("audience_tags").array().notNull(),
  status: text("status").notNull().default("active"),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  statusPublishedIndex: index("announcements_status_published_idx").on(table.status, table.publishedAt),
  expiresIndex: index("announcements_expires_idx").on(table.expiresAt),
}));

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;