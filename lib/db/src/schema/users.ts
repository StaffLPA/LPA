import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    birthday: text("birthday"),
    gender: text("gender"),
    profilePhotoUri: text("profile_photo_uri"),
    role: text("role").notNull(),
    status: text("status").notNull().default("invited"),
    teams: text("teams").array().notNull().default([]),
    passwordHash: text("password_hash"),
    inviteTokenHash: text("invite_token_hash"),
    inviteTokenExpiresAt: timestamp("invite_token_expires_at", { withTimezone: true }),
    invitedBy: text("invited_by"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
    phoneUnique: uniqueIndex("users_phone_unique").on(table.phone),
  }),
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  invitedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;