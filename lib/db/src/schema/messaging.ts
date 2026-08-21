import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const conversationsTable = pgTable("conversations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationMembersTable = pgTable("conversation_members", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  conversationUserUnique: uniqueIndex("conversation_members_conversation_user_unique").on(table.conversationId, table.userId),
}));

export const conversationReadStatesTable = pgTable("conversation_read_states", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  conversationUserUnique: uniqueIndex("conversation_read_states_conversation_user_unique").on(table.conversationId, table.userId),
}));

export const pushDevicesTable = pgTable("push_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  expoPushToken: text("expo_push_token").notNull(),
  platform: text("platform").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expoPushTokenUnique: uniqueIndex("push_devices_expo_push_token_unique").on(table.expoPushToken),
}));

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageAttachmentsTable = pgTable("message_attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ createdAt: true });
export const insertConversationMemberSchema = createInsertSchema(conversationMembersTable).omit({ joinedAt: true });
export const insertConversationReadStateSchema = createInsertSchema(conversationReadStatesTable).omit({ lastReadAt: true, updatedAt: true });
export const insertPushDeviceSchema = createInsertSchema(pushDevicesTable).omit({ createdAt: true, updatedAt: true });
export const insertMessageSchema = createInsertSchema(messagesTable).omit({ createdAt: true });
export const insertMessageAttachmentSchema = createInsertSchema(messageAttachmentsTable).omit({ createdAt: true });
export type Conversation = z.infer<typeof insertConversationSchema>;
export type ConversationMember = z.infer<typeof insertConversationMemberSchema>;
export type ConversationReadState = z.infer<typeof insertConversationReadStateSchema>;
export type PushDevice = z.infer<typeof insertPushDeviceSchema>;
export type Message = z.infer<typeof insertMessageSchema>;
export type MessageAttachment = z.infer<typeof insertMessageAttachmentSchema>;