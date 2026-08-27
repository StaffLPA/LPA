import { randomBytes } from "node:crypto";
import express, { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createChatAttachmentDownloadURL, createChatAttachmentUpload, getChatAttachmentFile, storeChatAttachment } from "../lib/chatAttachmentStorage";
import {
  conversationMembersTable,
  conversationReadStatesTable,
  conversationsTable,
  db,
  messageAttachmentsTable,
  messagesTable,
  pushDevicesTable,
  usersTable,
  type User,
} from "@workspace/db";
import { requireAdmin, requireSession } from "../lib/auth";
import { sendMessagePushNotification } from "../lib/messagePushService";

const router: IRouter = Router();
const value = (input: unknown) => typeof input === "string" && input.trim() ? input.trim() : null;
const maximumMessageLength = 2000;
const maximumAttachmentBytes = 10 * 1024 * 1024;
const id = () => randomBytes(16).toString("hex");
const mapConversation = (conversation: typeof conversationsTable.$inferSelect, lastMessage: typeof messagesTable.$inferSelect | undefined, members: User[], viewerId?: string, unreadCount = 0) => ({
  id: conversation.id,
  name: conversation.type === "direct"
    ? members.find((member) => member.id !== viewerId)?.fullName ?? conversation.name
    : conversation.name,
  type: conversation.type,
  isPinned: conversation.type === "group",
  createdBy: conversation.createdBy,
  createdAt: conversation.createdAt.toISOString(),
  unreadCount,
  members: members.map((member) => ({ id: member.id, fullName: member.fullName, role: member.role })),
  lastMessage: lastMessage ? {
    id: lastMessage.id,
    conversationId: lastMessage.conversationId,
    senderId: lastMessage.senderId,
    text: lastMessage.text || "Attachment",
    createdAt: lastMessage.createdAt.toISOString(),
  } : null,
});
const mapMessage = (message: typeof messagesTable.$inferSelect, sender: User | undefined, attachments: (typeof messageAttachmentsTable.$inferSelect)[] = []) => ({
  id: message.id,
  conversationId: message.conversationId,
  senderId: message.senderId,
  senderName: sender?.fullName ?? "LPA member",
  text: message.text,
  attachments: attachments.map((attachment) => ({ id: attachment.id, fileName: attachment.fileName, contentType: attachment.contentType, size: attachment.size })),
  createdAt: message.createdAt.toISOString(),
});

type AttachmentInput = { objectPath: string; fileName: string; contentType: string; size: number };
const isAllowedAttachment = (contentType: string) => contentType.startsWith("image/")
  || ["application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(contentType);
const attachmentValue = (input: unknown): AttachmentInput | null => {
  if (!input || typeof input !== "object") return null;
  const item = input as Record<string, unknown>;
  const objectPath = typeof item.objectPath === "string" ? item.objectPath : "";
  const fileName = typeof item.fileName === "string" ? item.fileName.trim().slice(0, 160) : "";
  const contentType = typeof item.contentType === "string" ? item.contentType.toLowerCase() : "";
  const size = typeof item.size === "number" && Number.isSafeInteger(item.size) ? item.size : 0;
  return objectPath && fileName && isAllowedAttachment(contentType) && size > 0 && size <= maximumAttachmentBytes ? { objectPath, fileName, contentType, size } : null;
};

async function attachmentsForMessages(messageIds: string[]) {
  if (!messageIds.length) return new Map<string, (typeof messageAttachmentsTable.$inferSelect)[]>();
  const attachments = await db.select().from(messageAttachmentsTable).where(inArray(messageAttachmentsTable.messageId, messageIds));
  return new Map(messageIds.map((messageId) => [messageId, attachments.filter((attachment) => attachment.messageId === messageId)]));
}

async function isMember(conversationId: string, userId: string) {
  const [member] = await db.select().from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.userId, userId))).limit(1);
  return Boolean(member);
}

async function getConversation(conversationId: string) {
  const [conversation] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
  return conversation;
}

async function getMembers(conversationId: string) {
  const rows = await db.select({ user: usersTable }).from(conversationMembersTable).innerJoin(usersTable, eq(conversationMembersTable.userId, usersTable.id)).where(eq(conversationMembersTable.conversationId, conversationId));
  return rows.map((row) => row.user);
}

async function getConversationResponse(conversation: typeof conversationsTable.$inferSelect, viewerId: string) {
  const [lastMessage] = await db.select().from(messagesTable).where(eq(messagesTable.conversationId, conversation.id)).orderBy(desc(messagesTable.createdAt)).limit(1);
  return mapConversation(conversation, lastMessage, await getMembers(conversation.id), viewerId);
}

function messagePreview(text: string, attachments: AttachmentInput[]) {
  if (text.trim()) return text.trim();
  if (!attachments.length) return "New message";
  if (attachments.length > 1) return `Sent ${attachments.length} attachments`;
  return attachments[0].contentType.startsWith("image/") ? "Sent a photo" : `Sent ${attachments[0].fileName}`;
}

async function notifyMessageRecipients(input: {
  conversation: typeof conversationsTable.$inferSelect;
  sender: User;
  messageId: string;
  text: string;
  attachments: AttachmentInput[];
}) {
  const recipients = (await getMembers(input.conversation.id)).filter((member) => member.id !== input.sender.id);
  if (!recipients.length) return;
  const devices = await db.select().from(pushDevicesTable).where(inArray(pushDevicesTable.userId, recipients.map((recipient) => recipient.id)));
  const title = input.conversation.type === "direct" ? input.sender.fullName : input.conversation.name;
  await sendMessagePushNotification({
    tokens: devices.map((device) => device.expoPushToken),
    title,
    body: messagePreview(input.text, input.attachments),
    conversationId: input.conversation.id,
    messageId: input.messageId,
  });
}

function canManageConversation(user: User, conversation: typeof conversationsTable.$inferSelect) {
  return user.role === "Admin" || conversation.createdBy === user.id;
}

router.get("/chats", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  const memberships = await db.select().from(conversationMembersTable).where(eq(conversationMembersTable.userId, user.id));
  if (!memberships.length) { res.json([]); return; }
  const conversationIds = memberships.map((membership) => membership.conversationId);
  const conversations = await db.select().from(conversationsTable).where(inArray(conversationsTable.id, conversationIds)).orderBy(desc(conversationsTable.createdAt));
  const allMembers = await db.select({ conversationId: conversationMembersTable.conversationId, user: usersTable }).from(conversationMembersTable).innerJoin(usersTable, eq(conversationMembersTable.userId, usersTable.id)).where(inArray(conversationMembersTable.conversationId, conversationIds));
  const [latestMessages, unreadRows] = await Promise.all([
    db.execute(sql`
      SELECT DISTINCT ON (conversation_id)
        id, conversation_id, sender_id, text, created_at
      FROM messages
      WHERE conversation_id IN (${sql.join(conversationIds.map((conversationId) => sql`${conversationId}`), sql`, `)})
      ORDER BY conversation_id, created_at DESC
    `),
    db.execute(sql`
      SELECT m.conversation_id, COUNT(*)::int AS unread_count
      FROM messages m
      INNER JOIN conversation_members cm
        ON cm.conversation_id = m.conversation_id AND cm.user_id = ${user.id}
      INNER JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN conversation_read_states crs
        ON crs.conversation_id = m.conversation_id AND crs.user_id = ${user.id}
      WHERE m.sender_id <> ${user.id}
        AND m.created_at > COALESCE(crs.last_read_at, cm.joined_at, c.created_at)
      GROUP BY m.conversation_id
    `),
  ]);
  const lastByConversation = new Map<string, typeof messagesTable.$inferSelect>();
  for (const row of latestMessages.rows) {
    const message = row as Record<string, unknown>;
    lastByConversation.set(String(message.conversation_id), {
      id: String(message.id),
      conversationId: String(message.conversation_id),
      senderId: String(message.sender_id),
      text: String(message.text ?? ""),
      createdAt: new Date(String(message.created_at)),
    });
  }
  const unreadByConversation = new Map(unreadRows.rows.map((row) => {
    const item = row as Record<string, unknown>;
    return [String(item.conversation_id), Number(item.unread_count)] as const;
  }));
  const membersByConversation = new Map<string, User[]>();
  for (const member of allMembers) {
    const current = membersByConversation.get(member.conversationId) ?? [];
    current.push(member.user);
    membersByConversation.set(member.conversationId, current);
  }
  res.json(conversations.map((conversation) => mapConversation(
    conversation,
    lastByConversation.get(conversation.id),
    membersByConversation.get(conversation.id) ?? [],
    user.id,
    unreadByConversation.get(conversation.id) ?? 0,
  )));
});

router.post("/push-tokens", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  const expoPushToken = value(req.body.expoPushToken);
  const platform = value(req.body.platform);
  const mobilePlatform = platform === "ios" || platform === "android" ? platform : null;
  if (!expoPushToken || !/^(?:Expo|Exponent)PushToken\[[^\]]+\]$/.test(expoPushToken) || !mobilePlatform) {
    res.status(400).json({ message: "A valid Expo push token and mobile platform are required." }); return;
  }
  const now = new Date();
  const [device] = await db.insert(pushDevicesTable).values({ id: id(), userId: user.id, expoPushToken, platform: mobilePlatform, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: pushDevicesTable.expoPushToken, set: { userId: user.id, platform: mobilePlatform, updatedAt: now } })
    .returning();
  res.status(201).json({ id: device.id, platform: device.platform });
});

router.delete("/push-tokens", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  const expoPushToken = value(req.body.expoPushToken);
  if (!expoPushToken) { res.status(400).json({ message: "A push token is required." }); return; }
  await db.delete(pushDevicesTable).where(and(eq(pushDevicesTable.userId, user.id), eq(pushDevicesTable.expoPushToken, expoPushToken)));
  res.status(204).send();
});

router.post("/chats/:conversationId/read", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  if (!await isMember(req.params.conversationId, user.id)) { res.status(403).json({ message: "You are not a member of this conversation." }); return; }
  const now = new Date();
  await db.insert(conversationReadStatesTable).values({ id: id(), conversationId: req.params.conversationId, userId: user.id, lastReadAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [conversationReadStatesTable.conversationId, conversationReadStatesTable.userId], set: { lastReadAt: now, updatedAt: now } });
  res.status(204).send();
});

router.post("/chats", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  const type = value(req.body.type);
  const userIds: string[] = Array.isArray(req.body.userIds) ? Array.from(new Set((req.body.userIds as unknown[]).filter((item: unknown): item is string => typeof item === "string" && Boolean(item.trim())))) : [];
  const name = value(req.body.name);
  if (type === "group") {
    if (!requireAdmin(user, res)) return;
    if (!name || !userIds.length) { res.status(400).json({ message: "A group name and at least one participant are required." }); return; }
  } else if (type !== "direct" || userIds.length !== 1 || userIds[0] === user.id) {
    res.status(400).json({ message: "New conversations must be direct messages with one other active LPA user." }); return;
  }
  const activeMembers = await db.select().from(usersTable).where(and(inArray(usersTable.id, userIds), eq(usersTable.status, "active")));
  if (activeMembers.length !== userIds.length) { res.status(400).json({ message: "Every selected member must be active." }); return; }
  if (type === "group") {
    const conversation = { id: id(), name: name!, type: "group" as const, createdBy: user.id };
    await db.transaction(async (tx) => {
      await tx.insert(conversationsTable).values(conversation);
      await tx.insert(conversationMembersTable).values([user, ...activeMembers].filter((member, index, all) => all.findIndex((candidate) => candidate.id === member.id) === index).map((member) => ({ id: id(), conversationId: conversation.id, userId: member.id })));
    });
    res.status(201).json(mapConversation({ ...conversation, createdAt: new Date() }, undefined, [user, ...activeMembers], user.id));
    return;
  }
  const directConversations = await db.select().from(conversationsTable).where(eq(conversationsTable.type, "direct"));
  const directIds = directConversations.map((conversation) => conversation.id);
  if (directIds.length) {
    const directMembers = await db.select().from(conversationMembersTable).where(inArray(conversationMembersTable.conversationId, directIds));
    const existing = directConversations.find((conversation) => {
      const members = directMembers.filter((member) => member.conversationId === conversation.id).map((member) => member.userId);
      return members.length === 2 && members.includes(user.id) && members.includes(userIds[0]);
    });
    if (existing) {
      res.status(200).json(await getConversationResponse(existing, user.id));
      return;
    }
  }
  const conversation = { id: id(), name: "", type: "direct", createdBy: user.id };
  await db.transaction(async (tx) => {
    await tx.insert(conversationsTable).values(conversation);
    await tx.insert(conversationMembersTable).values([user.id, ...userIds].filter((memberId, index, all) => all.indexOf(memberId) === index).map((userId) => ({ id: id(), conversationId: conversation.id, userId })));
  });
  res.status(201).json(mapConversation({ ...conversation, createdAt: new Date() }, undefined, activeMembers.some((member) => member.id === user.id) ? activeMembers : [user, ...activeMembers], user.id));
});

router.delete("/chats/:conversationId", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  if (!requireAdmin(user, res)) return;
  const conversation = await getConversation(req.params.conversationId);
  if (!conversation) { res.status(404).json({ message: "Conversation not found." }); return; }
  if (conversation.type === "direct") { res.status(400).json({ message: "Direct messages cannot be deleted as conversations." }); return; }
  await db.delete(conversationsTable).where(eq(conversationsTable.id, conversation.id));
  res.status(204).send();
});

router.post("/chats/:conversationId/members", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  const conversation = await getConversation(req.params.conversationId);
  if (!conversation) { res.status(404).json({ message: "Conversation not found." }); return; }
  if (!canManageConversation(user, conversation)) { res.status(403).json({ message: "Only the conversation manager can change participants." }); return; }
  if (conversation.type === "direct") { res.status(400).json({ message: "Direct messages always have exactly two participants." }); return; }
  const userId = value(req.body.userId);
  if (!userId) { res.status(400).json({ message: "A participant is required." }); return; }
  const [candidate] = await db.select().from(usersTable).where(and(eq(usersTable.id, userId), eq(usersTable.status, "active"))).limit(1);
  if (!candidate) { res.status(400).json({ message: "The participant must be an active LPA user." }); return; }
  if (await isMember(conversation.id, userId)) { res.status(409).json({ message: "That person is already a participant." }); return; }
  await db.insert(conversationMembersTable).values({ id: id(), conversationId: conversation.id, userId });
  res.status(201).json({ id: candidate.id, fullName: candidate.fullName, role: candidate.role });
});

router.delete("/chats/:conversationId/members/:userId", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  const conversation = await getConversation(req.params.conversationId);
  if (!conversation) { res.status(404).json({ message: "Conversation not found." }); return; }
  if (!canManageConversation(user, conversation)) { res.status(403).json({ message: "Only the conversation manager can change participants." }); return; }
  if (conversation.type === "direct") { res.status(400).json({ message: "Direct messages always have exactly two participants." }); return; }
  if (req.params.userId === conversation.createdBy) { res.status(400).json({ message: "The conversation creator cannot be removed." }); return; }
  const deleted = await db.delete(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.userId, req.params.userId))).returning({ id: conversationMembersTable.id });
  if (!deleted.length) { res.status(404).json({ message: "That person is not a participant." }); return; }
  res.status(204).send();
});

router.get("/chats/:conversationId/messages", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  if (!await isMember(req.params.conversationId, user.id)) { res.status(403).json({ message: "You are not a member of this conversation." }); return; }
  const messages = (await db.select().from(messagesTable).where(eq(messagesTable.conversationId, req.params.conversationId)).orderBy(desc(messagesTable.createdAt)).limit(100)).reverse();
  const senderIds = [...new Set(messages.map((message) => message.senderId))];
  const senders = senderIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, senderIds)) : [];
  const attachments = await attachmentsForMessages(messages.map((message) => message.id));
  res.json(messages.map((message) => mapMessage(message, senders.find((sender) => sender.id === message.senderId), attachments.get(message.id))));
});

router.post("/chats/:conversationId/attachments/upload-url", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  if (!await isMember(req.params.conversationId, user.id)) { res.status(403).json({ message: "You are not a member of this conversation." }); return; }
  const attachment = attachmentValue({ objectPath: "/objects/uploads/00000000-0000-0000-0000-000000000000", ...req.body });
  if (!attachment) { res.status(400).json({ message: "Choose an image, PDF, text document, Word document, or file up to 10 MB." }); return; }
  const upload = await createChatAttachmentUpload();
  res.status(201).json(upload);
});

router.post("/chats/:conversationId/attachments/upload", express.raw({ type: "*/*", limit: maximumAttachmentBytes }), async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  if (!await isMember(req.params.conversationId, user.id)) { res.status(403).json({ message: "You are not a member of this conversation." }); return; }
  const fileName = value(req.query.fileName);
  const contentType = req.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const bytes = Buffer.isBuffer(req.body) ? req.body : null;
  if (!fileName || !isAllowedAttachment(contentType) || !bytes?.length || bytes.length > maximumAttachmentBytes) {
    res.status(400).json({ message: "Choose an image, PDF, text document, Word document, or file up to 10 MB." });
    return;
  }
  try {
    const upload = await storeChatAttachment(bytes, contentType);
    res.status(201).json(upload);
  } catch (error) {
    req.log.warn({ err: error, conversationId: req.params.conversationId }, "Chat attachment upload failed");
    res.status(502).json({ message: "Could not upload the attachment. Please try again." });
  }
});

router.post("/chats/:conversationId/messages", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  if (!await isMember(req.params.conversationId, user.id)) { res.status(403).json({ message: "You are not a member of this conversation." }); return; }
  const text = value(req.body.text);
  const attachments: Array<AttachmentInput | null> = Array.isArray(req.body.attachments) ? req.body.attachments.map((attachment: unknown) => attachmentValue(attachment)) : [];
  if (attachments.some((attachment) => !attachment) || attachments.length > 5) { res.status(400).json({ message: "Messages can include up to five supported attachments of 10 MB each." }); return; }
  const validAttachments = attachments.filter((attachment): attachment is AttachmentInput => Boolean(attachment));
  if (!text && !validAttachments.length) { res.status(400).json({ message: "Add a message or attachment before sending." }); return; }
  if (text && text.length > maximumMessageLength) { res.status(400).json({ message: "Messages must be 2,000 characters or fewer." }); return; }
  try { await Promise.all(validAttachments.map((attachment) => getChatAttachmentFile(attachment.objectPath))); } catch { res.status(400).json({ message: "One or more attachments could not be found. Please upload again." }); return; }
  const message = { id: id(), conversationId: req.params.conversationId, senderId: user.id, text: text ?? "" };
  const [created] = await db.transaction(async (tx) => {
    const [saved] = await tx.insert(messagesTable).values(message).returning();
    if (validAttachments.length) await tx.insert(messageAttachmentsTable).values(validAttachments.map((attachment) => ({ id: id(), messageId: message.id, ...attachment })));
    await tx.insert(conversationReadStatesTable).values({ id: id(), conversationId: message.conversationId, userId: user.id, lastReadAt: saved.createdAt, updatedAt: saved.createdAt })
      .onConflictDoUpdate({ target: [conversationReadStatesTable.conversationId, conversationReadStatesTable.userId], set: { lastReadAt: saved.createdAt, updatedAt: saved.createdAt } });
    return [saved];
  });
  const savedAttachments = validAttachments.map((attachment) => ({ id: "", messageId: message.id, ...attachment, createdAt: created.createdAt }));
  const conversation = await getConversation(message.conversationId);
  if (conversation) {
    void notifyMessageRecipients({ conversation, sender: user, messageId: message.id, text: message.text, attachments: validAttachments })
      .catch((error) => req.log.warn({ err: error, conversationId: message.conversationId, messageId: message.id }, "Message was saved but push delivery failed"));
  }
  res.status(201).json(mapMessage({ ...message, createdAt: created.createdAt }, user, savedAttachments));
});

router.get("/chats/:conversationId/attachments/:attachmentId", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  if (!await isMember(req.params.conversationId, user.id)) { res.status(403).json({ message: "You are not a member of this conversation." }); return; }
  const [match] = await db.select({ attachment: messageAttachmentsTable }).from(messageAttachmentsTable).innerJoin(messagesTable, eq(messageAttachmentsTable.messageId, messagesTable.id)).where(and(eq(messageAttachmentsTable.id, req.params.attachmentId), eq(messagesTable.conversationId, req.params.conversationId))).limit(1);
  const attachment = match?.attachment;
  if (!attachment) { res.status(404).json({ message: "Attachment not found." }); return; }
  try {
    const file = await getChatAttachmentFile(attachment.objectPath);
    const [metadata] = await file.getMetadata();
    res.setHeader("content-type", attachment.contentType || metadata.contentType || "application/octet-stream");
    res.setHeader("content-disposition", `${attachment.contentType.startsWith("image/") ? "inline" : "attachment"}; filename="${attachment.fileName.replace(/"/g, "")}"`);
    res.setHeader("cache-control", "private, max-age=300");
    file.createReadStream().on("error", () => res.status(404).end()).pipe(res);
  } catch { res.status(404).json({ message: "Attachment not found." }); }
});

router.get("/chats/:conversationId/attachments/:attachmentId/access-url", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  if (!await isMember(req.params.conversationId, user.id)) { res.status(403).json({ message: "You are not a member of this conversation." }); return; }
  const [match] = await db.select({ attachment: messageAttachmentsTable }).from(messageAttachmentsTable).innerJoin(messagesTable, eq(messageAttachmentsTable.messageId, messagesTable.id)).where(and(eq(messageAttachmentsTable.id, req.params.attachmentId), eq(messagesTable.conversationId, req.params.conversationId))).limit(1);
  const attachment = match?.attachment;
  if (!attachment) { res.status(404).json({ message: "Attachment not found." }); return; }
  try { res.json({ url: await createChatAttachmentDownloadURL(attachment.objectPath) }); } catch { res.status(404).json({ message: "Attachment not found." }); }
});

router.delete("/chats/:conversationId/messages/:messageId", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  if (!await isMember(req.params.conversationId, user.id)) { res.status(403).json({ message: "You are not a member of this conversation." }); return; }
  const conversation = await getConversation(req.params.conversationId);
  const [message] = await db.select().from(messagesTable).where(and(eq(messagesTable.id, req.params.messageId), eq(messagesTable.conversationId, req.params.conversationId))).limit(1);
  if (!conversation || !message) { res.status(404).json({ message: "Message not found." }); return; }
  if (message.senderId !== user.id && (conversation.type === "direct" || !canManageConversation(user, conversation))) { res.status(403).json({ message: "You can only delete your own messages." }); return; }
  await db.delete(messagesTable).where(eq(messagesTable.id, message.id));
  res.status(204).send();
});

export default router;