import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import http from "node:http";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import app from "../src/app";
import {
  calendarEventsTable,
  conversationMembersTable,
  conversationsTable,
  db,
  messagesTable,
  pool,
  pushDevicesTable,
  usersTable,
} from "@workspace/db";
import { createSession } from "../src/lib/auth";
import { setInviteNotificationSenderForTests } from "../src/lib/notificationService";
import { sendMessagePushNotification, setMessagePushSenderForTests, type MessagePushNotification } from "../src/lib/messagePushService";

const suffix = randomBytes(8).toString("hex");
const admin = {
  id: `messaging-test-admin-${suffix}`,
  fullName: "Messaging Test Admin",
  email: `messaging-test-admin-${suffix}@example.com`,
  role: "Admin",
  status: "active",
  passwordHash: "test-password-hash",
  teams: [] as string[],
};
const member = {
  id: `messaging-test-member-${suffix}`,
  fullName: "Messaging Test Member",
  email: `messaging-test-member-${suffix}@example.com`,
  role: "Athlete",
  status: "active",
  passwordHash: "test-password-hash",
  teams: ["Varsity"] as string[],
};
const nonMember = {
  id: `messaging-test-non-member-${suffix}`,
  fullName: "Messaging Test Non-member",
  email: `messaging-test-non-member-${suffix}@example.com`,
  role: "Athlete",
  status: "active",
  passwordHash: "test-password-hash",
  teams: [] as string[],
};

let server: http.Server;
let baseUrl: string;
let conversationId: string;
let groupConversationId: string;
let directConversationId: string;
let managedConversationId: string;
let deletableConversationId: string;
let invitedUserId: string;
let expiredUserId: string;
let revokedUserId: string;
let calendarEventId: string;
const teamCalendarEventIds: string[] = [];
const pushNotifications: MessagePushNotification[] = [];

before(async () => {
  await db.insert(usersTable).values([admin, member, nonMember]);
  setInviteNotificationSenderForTests(async () => undefined);
  setMessagePushSenderForTests(async (notification) => { pushNotifications.push(notification); });
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  server.close();
  await once(server, "close");
  const seeded = await db.select({ id: conversationsTable.id }).from(conversationsTable).where(eq(conversationsTable.createdBy, admin.id));
  const seededIds = seeded.map(({ id }) => id);
  if (seededIds.length) {
    await db.delete(messagesTable).where(inArray(messagesTable.conversationId, seededIds));
    await db.delete(conversationMembersTable).where(inArray(conversationMembersTable.conversationId, seededIds));
    await db.delete(conversationsTable).where(inArray(conversationsTable.id, seededIds));
  }
  if (conversationId) {
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, conversationId));
    await db.delete(conversationMembersTable).where(eq(conversationMembersTable.conversationId, conversationId));
    await db.delete(conversationsTable).where(eq(conversationsTable.id, conversationId));
  }
  if (groupConversationId) {
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, groupConversationId));
    await db.delete(conversationMembersTable).where(eq(conversationMembersTable.conversationId, groupConversationId));
    await db.delete(conversationsTable).where(eq(conversationsTable.id, groupConversationId));
  }
  if (directConversationId) {
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, directConversationId));
    await db.delete(conversationMembersTable).where(eq(conversationMembersTable.conversationId, directConversationId));
    await db.delete(conversationsTable).where(eq(conversationsTable.id, directConversationId));
  }
  if (managedConversationId) {
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, managedConversationId));
    await db.delete(conversationMembersTable).where(eq(conversationMembersTable.conversationId, managedConversationId));
    await db.delete(conversationsTable).where(eq(conversationsTable.id, managedConversationId));
  }
  if (deletableConversationId) {
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, deletableConversationId));
    await db.delete(conversationMembersTable).where(eq(conversationMembersTable.conversationId, deletableConversationId));
    await db.delete(conversationsTable).where(eq(conversationsTable.id, deletableConversationId));
  }
  if (invitedUserId) await db.delete(usersTable).where(eq(usersTable.id, invitedUserId));
  if (expiredUserId) await db.delete(usersTable).where(eq(usersTable.id, expiredUserId));
  if (revokedUserId) await db.delete(usersTable).where(eq(usersTable.id, revokedUserId));
  if (calendarEventId) await db.delete(calendarEventsTable).where(eq(calendarEventsTable.id, calendarEventId));
  if (teamCalendarEventIds.length) await db.delete(calendarEventsTable).where(inArray(calendarEventsTable.id, teamCalendarEventIds));
  await db.delete(usersTable).where(inArray(usersTable.id, [admin.id, member.id, nonMember.id]));
  setInviteNotificationSenderForTests();
  setMessagePushSenderForTests();
  await pool.end();
});

async function request(path: string, options: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

function auth(user: typeof admin) {
  return { authorization: `Bearer ${createSession(user)}` };
}

async function seedExistingConversation(type: "channel" | "group", name: string) {
  const id = `legacy-${type}-${randomBytes(8).toString("hex")}`;
  await db.transaction(async (tx) => {
    await tx.insert(conversationsTable).values({ id, name, type, createdBy: admin.id });
    await tx.insert(conversationMembersTable).values([admin, member].map((user) => ({ id: `legacy-member-${randomBytes(8).toString("hex")}`, conversationId: id, userId: user.id })));
  });
  return { id, type, members: [admin, member] };
}

async function waitForPush(messageId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (pushNotifications.some((notification) => notification.messageId === messageId)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Push notification for ${messageId} was not sent.`);
}

test("members can access existing channel history while non-members are denied", async () => {
  const conversation = await seedExistingConversation("channel", "Cross-user delivery regression channel");
  conversationId = conversation.id;
  assert.deepEqual(conversation.members.map(({ id }) => id).sort(), [admin.id, member.id].sort());

  const listResponse = await request("/chats", { headers: auth(member) });
  assert.equal(listResponse.status, 200);
  const listedConversations = await listResponse.json() as { id: string }[];
  assert.equal(listedConversations.some(({ id }) => id === conversation.id), true);

  const nonMemberListResponse = await request("/chats", { headers: auth(nonMember) });
  assert.equal(nonMemberListResponse.status, 200);
  const nonMemberConversations = await nonMemberListResponse.json() as { id: string }[];
  assert.equal(nonMemberConversations.some(({ id }) => id === conversation.id), false);

  const sendResponse = await request(`/chats/${conversation.id}/messages`, {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ text: "Member message survives the round trip." }),
  });
  assert.equal(sendResponse.status, 201);
  const sentMessage = await sendResponse.json() as { conversationId: string; senderId: string; text: string };
  assert.deepEqual(
    { conversationId: sentMessage.conversationId, senderId: sentMessage.senderId, text: sentMessage.text },
    {
    conversationId: conversation.id,
    senderId: member.id,
    text: "Member message survives the round trip.",
    },
  );

  const adminChatsAfterMemberMessage = await request("/chats", { headers: auth(admin) });
  assert.equal(adminChatsAfterMemberMessage.status, 200);
  const adminConversation = (await adminChatsAfterMemberMessage.json() as { id: string; lastMessage: { senderId: string; text: string } | null }[])
    .find(({ id }) => id === conversation.id);
  assert.deepEqual(adminConversation?.lastMessage && {
    senderId: adminConversation.lastMessage.senderId,
    text: adminConversation.lastMessage.text,
  }, {
    senderId: member.id,
    text: "Member message survives the round trip.",
  });

  const historyResponse = await request(`/chats/${conversation.id}/messages`, { headers: auth(member) });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json() as { senderId: string; text: string }[];
  assert.deepEqual(history.map(({ senderId, text }) => ({ senderId, text })), [
    { senderId: member.id, text: "Member message survives the round trip." },
  ]);

  const deniedHistory = await request(`/chats/${conversation.id}/messages`, { headers: auth(nonMember) });
  assert.equal(deniedHistory.status, 403);

  const deniedSend = await request(`/chats/${conversation.id}/messages`, {
    method: "POST",
    headers: auth(nonMember),
    body: JSON.stringify({ text: "This must not be delivered." }),
  });
  assert.equal(deniedSend.status, 403);
});

test("existing group chats and shared delivery remain isolated to their members", async () => {
  const group = await seedExistingConversation("group", "Cross-user delivery regression group");
  groupConversationId = group.id;
  assert.equal(group.type, "group");
  assert.deepEqual(group.members.map(({ id }) => id).sort(), [admin.id, member.id].sort());

  const memberChats = await request("/chats", { headers: auth(member) });
  assert.equal(memberChats.status, 200);
  const memberConversations = await memberChats.json() as { id: string; type: string }[];
  assert.deepEqual(memberConversations.find(({ id }) => id === group.id)?.type, "group");

  const sendResponse = await request(`/chats/${group.id}/messages`, {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({ text: "Group message survives the round trip." }),
  });
  assert.equal(sendResponse.status, 201);

  const memberHistoryResponse = await request(`/chats/${group.id}/messages`, { headers: auth(member) });
  assert.equal(memberHistoryResponse.status, 200);
  const memberHistory = await memberHistoryResponse.json() as { senderId: string; text: string }[];
  assert.deepEqual(memberHistory.map(({ senderId, text }) => ({ senderId, text })), [
    { senderId: admin.id, text: "Group message survives the round trip." },
  ]);

  const nonMemberChats = await request("/chats", { headers: auth(nonMember) });
  assert.equal(nonMemberChats.status, 200);
  const nonMemberConversations = await nonMemberChats.json() as { id: string }[];
  assert.equal(nonMemberConversations.some(({ id }) => id === group.id), false);

  const deniedHistory = await request(`/chats/${group.id}/messages`, { headers: auth(nonMember) });
  assert.equal(deniedHistory.status, 403);
});

test("direct messages are unnamed, available to members, and never duplicated", async () => {
  const directoryResponse = await request("/users", { headers: auth(member) });
  assert.equal(directoryResponse.status, 200);
  const directory = await directoryResponse.json() as { id: string; status: string }[];
  assert.equal(directory.some(({ id, status }) => id === nonMember.id && status === "active"), true);

  const createResponse = await request("/chats", {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ type: "direct", userIds: [nonMember.id] }),
  });
  assert.equal(createResponse.status, 201);
  const direct = await createResponse.json() as { id: string; type: string; name: string; members: { id: string }[] };
  directConversationId = direct.id;
  assert.equal(direct.type, "direct");
  assert.equal(direct.name, nonMember.fullName);
  assert.deepEqual(direct.members.map(({ id }) => id).sort(), [member.id, nonMember.id].sort());

  const duplicateResponse = await request("/chats", {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ type: "direct", userIds: [nonMember.id] }),
  });
  assert.equal(duplicateResponse.status, 200);
  const duplicate = await duplicateResponse.json() as { id: string };
  assert.equal(duplicate.id, direct.id);

  const recipientChats = await request("/chats", { headers: auth(nonMember) });
  const recipientConversation = (await recipientChats.json() as { id: string; name: string }[]).find(({ id }) => id === direct.id);
  assert.equal(recipientConversation?.name, member.fullName);
});

test("direct-message attachments reach the other participant and stay private", async () => {
  assert(directConversationId);
  const uploadResponse = await request(`/chats/${directConversationId}/attachments/upload-url`, {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ fileName: "team-note.txt", contentType: "text/plain", size: 20 }),
  });
  assert.equal(uploadResponse.status, 201);
  const upload = await uploadResponse.json() as { uploadURL: string; objectPath: string };
  const uploadPut = await fetch(upload.uploadURL, { method: "PUT", headers: { "content-type": "text/plain" }, body: "private team note text" });
  assert.equal(uploadPut.ok, true);

  const sendResponse = await request(`/chats/${directConversationId}/messages`, {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ text: "", attachments: [{ ...upload, fileName: "team-note.txt", contentType: "text/plain", size: 20 }] }),
  });
  assert.equal(sendResponse.status, 201);
  const sent = await sendResponse.json() as { attachments: { id: string; fileName: string }[] };
  assert.equal(sent.attachments[0]?.fileName, "team-note.txt");

  const recipientHistory = await request(`/chats/${directConversationId}/messages`, { headers: auth(nonMember) });
  const history = await recipientHistory.json() as { attachments: { id: string }[] }[];
  const attachmentId = history.at(-1)?.attachments[0]?.id;
  assert(attachmentId);
  const deniedAccess = await request(`/chats/${directConversationId}/attachments/${attachmentId}/access-url`, { headers: auth(admin) });
  assert.equal(deniedAccess.status, 403);
  const allowedAccess = await request(`/chats/${directConversationId}/attachments/${attachmentId}/access-url`, { headers: auth(nonMember) });
  assert.equal(allowedAccess.status, 200);
});

test("message notifications persist unread state, target recipients, and never block delivery", async () => {
  assert(directConversationId);
  const recipientToken = `ExpoPushToken[recipient-${suffix}]`;
  const senderToken = `ExpoPushToken[sender-${suffix}]`;
  const registerRecipient = await request("/push-tokens", {
    method: "POST",
    headers: auth(nonMember),
    body: JSON.stringify({ expoPushToken: recipientToken, platform: "ios" }),
  });
  assert.equal(registerRecipient.status, 201);
  const registerSender = await request("/push-tokens", {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ expoPushToken: senderToken, platform: "android" }),
  });
  assert.equal(registerSender.status, 201);

  const uploadResponse = await request(`/chats/${directConversationId}/attachments/upload-url`, {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ fileName: "team-update.txt", contentType: "text/plain", size: 20 }),
  });
  assert.equal(uploadResponse.status, 201);
  const upload = await uploadResponse.json() as { uploadURL: string; objectPath: string };
  assert.equal((await fetch(upload.uploadURL, { method: "PUT", headers: { "content-type": "text/plain" }, body: "notification attachment" })).ok, true);
  const attachmentOnly = await request(`/chats/${directConversationId}/messages`, {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ text: "", attachments: [{ ...upload, fileName: "team-update.txt", contentType: "text/plain", size: 20 }] }),
  });
  assert.equal(attachmentOnly.status, 201);
  const sent = await attachmentOnly.json() as { id: string };
  await waitForPush(sent.id);
  const directPush = pushNotifications.find((notification) => notification.messageId === sent.id);
  assert(directPush);
  assert.deepEqual(directPush.tokens, [recipientToken]);
  assert.equal(directPush.body, "Sent team-update.txt");

  const recipientChats = await request("/chats", { headers: auth(nonMember) });
  const unreadConversation = (await recipientChats.json() as { id: string; unreadCount: number }[]).find((chat) => chat.id === directConversationId);
  assert((unreadConversation?.unreadCount ?? 0) > 0);
  const markRead = await request(`/chats/${directConversationId}/read`, { method: "POST", headers: auth(nonMember) });
  assert.equal(markRead.status, 204);
  const afterRead = await request("/chats", { headers: auth(nonMember) });
  const readConversation = (await afterRead.json() as { id: string; unreadCount: number }[]).find((chat) => chat.id === directConversationId);
  assert.equal(readConversation?.unreadCount, 0);

  const removeToken = await request("/push-tokens", {
    method: "DELETE",
    headers: auth(member),
    body: JSON.stringify({ expoPushToken: senderToken }),
  });
  assert.equal(removeToken.status, 204);
  const removedToken = await db.select().from(pushDevicesTable).where(eq(pushDevicesTable.expoPushToken, senderToken));
  assert.equal(removedToken.length, 0);

  setMessagePushSenderForTests(async () => { throw new Error("Expo is unavailable"); });
  const stillSends = await request(`/chats/${directConversationId}/messages`, {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ text: "This message remains available despite a push outage." }),
  });
  assert.equal(stillSends.status, 201);
  setMessagePushSenderForTests(async (notification) => { pushNotifications.push(notification); });
});

test("group messages notify every registered participant except the sender", async () => {
  const conversation = await seedExistingConversation("group", "Push delivery group");
  const adminToken = `ExpoPushToken[admin-${suffix}]`;
  const memberToken = `ExpoPushToken[group-member-${suffix}]`;
  assert.equal((await request("/push-tokens", { method: "POST", headers: auth(admin), body: JSON.stringify({ expoPushToken: adminToken, platform: "ios" }) })).status, 201);
  assert.equal((await request("/push-tokens", { method: "POST", headers: auth(member), body: JSON.stringify({ expoPushToken: memberToken, platform: "android" }) })).status, 201);
  const sentResponse = await request(`/chats/${conversation.id}/messages`, {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({ text: "Film review starts at 6 PM." }),
  });
  assert.equal(sentResponse.status, 201);
  const sent = await sentResponse.json() as { id: string };
  await waitForPush(sent.id);
  const groupPush = pushNotifications.find((notification) => notification.messageId === sent.id);
  assert(groupPush);
  assert.deepEqual(groupPush.tokens, [memberToken]);
  assert.equal(groupPush.title, "Push delivery group");
  await db.delete(conversationsTable).where(eq(conversationsTable.id, conversation.id));
});

test("Expo receipt cleanup runs after sending and removes only unregistered devices", async () => {
  const invalidToken = `ExpoPushToken[receipt-invalid-${suffix}]`;
  const validToken = `ExpoPushToken[receipt-valid-${suffix}]`;
  const unrelatedToken = `ExpoPushToken[receipt-unrelated-${suffix}]`;
  const tokens = [invalidToken, validToken, unrelatedToken];
  await db.insert(pushDevicesTable).values(tokens.map((expoPushToken, index) => ({
    id: `receipt-device-${suffix}-${index}`,
    userId: nonMember.id,
    expoPushToken,
    platform: "ios",
  })));

  const originalFetch = globalThis.fetch;
  let receiptRequestStarted = false;
  let releaseReceipt!: () => void;
  const receiptResponseReady = new Promise<void>((resolve) => { releaseReceipt = resolve; });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(init?.method, "POST");
    if (url.endsWith("/push/send")) {
      const body = JSON.parse(String(init?.body)) as { to: string }[];
      assert.deepEqual(body.map(({ to }) => to), tokens);
      return Response.json({
        data: tokens.map((_, index) => ({ status: "ok", id: `receipt-${index}` })),
      });
    }
    if (url.endsWith("/push/getReceipts")) {
      receiptRequestStarted = true;
      await receiptResponseReady;
      return Response.json({
        data: {
          "receipt-0": { status: "error", details: { error: "DeviceNotRegistered" } },
          "receipt-1": { status: "ok" },
          "receipt-2": { status: "error", details: { error: "MessageRateExceeded" } },
        },
      });
    }
    throw new Error(`Unexpected Expo URL: ${url}`);
  };

  try {
    setMessagePushSenderForTests();
    const sendPromise = sendMessagePushNotification({
      tokens,
      title: "Receipt cleanup test",
      body: "This is a deterministic Expo transport test.",
      conversationId: `receipt-conversation-${suffix}`,
      messageId: `receipt-message-${suffix}`,
    });

    await sendPromise;
    assert.equal(receiptRequestStarted, true);
    const beforeReceipt = await db.select({ expoPushToken: pushDevicesTable.expoPushToken })
      .from(pushDevicesTable)
      .where(inArray(pushDevicesTable.expoPushToken, tokens));
    assert.deepEqual(beforeReceipt.map(({ expoPushToken }) => expoPushToken).sort(), [...tokens].sort());

    releaseReceipt();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const remaining = await db.select({ expoPushToken: pushDevicesTable.expoPushToken })
        .from(pushDevicesTable)
        .where(inArray(pushDevicesTable.expoPushToken, tokens));
      if (remaining.length === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const remaining = await db.select({ expoPushToken: pushDevicesTable.expoPushToken })
      .from(pushDevicesTable)
      .where(inArray(pushDevicesTable.expoPushToken, tokens));
    assert.deepEqual(remaining.map(({ expoPushToken }) => expoPushToken).sort(), [unrelatedToken, validToken].sort());
  } finally {
    releaseReceipt();
    globalThis.fetch = originalFetch;
    await db.delete(pushDevicesTable).where(inArray(pushDevicesTable.expoPushToken, tokens));
    setMessagePushSenderForTests(async (notification) => { pushNotifications.push(notification); });
  }
});

test("admins can create group chats while other users can only create direct messages", async () => {
  for (const actor of [admin, member] as const) {
    const response = await request("/chats", { method: "POST", headers: auth(actor), body: JSON.stringify({ name: "Not allowed", type: "channel", userIds: [nonMember.id] }) });
    assert.equal(response.status, 400);
  }
  const nonAdminGroup = await request("/chats", { method: "POST", headers: auth(member), body: JSON.stringify({ name: "Not allowed", type: "group", userIds: [nonMember.id] }) });
  assert.equal(nonAdminGroup.status, 403);

  const adminGroup = await request("/chats", { method: "POST", headers: auth(admin), body: JSON.stringify({ name: "Admin group", type: "group", userIds: [nonMember.id] }) });
  assert.equal(adminGroup.status, 201);
  const created = await adminGroup.json() as { id: string; type: string; name: string; isPinned: boolean; members: { id: string }[] };
  assert.equal(created.type, "group");
  assert.equal(created.name, "Admin group");
  assert.equal(created.isPinned, true);
  assert.deepEqual(created.members.map(({ id }) => id).sort(), [admin.id, nonMember.id].sort());

  const participantChats = await request("/chats", { headers: auth(nonMember) });
  assert.equal(participantChats.status, 200);
  const participantGroup = (await participantChats.json() as { id: string; isPinned: boolean }[]).find((chat) => chat.id === created.id);
  assert.equal(participantGroup?.isPinned, true);
});

test("existing channel and group managers can change participants and delete messages safely", async () => {
  const managed = await seedExistingConversation("group", "Managed group");
  managedConversationId = managed.id;

  const addResponse = await request(`/chats/${managed.id}/members`, {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({ userId: nonMember.id }),
  });
  assert.equal(addResponse.status, 201);

  const deniedRemoval = await request(`/chats/${managed.id}/members/${nonMember.id}`, {
    method: "DELETE",
    headers: auth(member),
  });
  assert.equal(deniedRemoval.status, 403);

  const sentResponse = await request(`/chats/${managed.id}/messages`, {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ text: "This message can be deleted by its sender." }),
  });
  assert.equal(sentResponse.status, 201);
  const sent = await sentResponse.json() as { id: string };

  const deniedDelete = await request(`/chats/${managed.id}/messages/${sent.id}`, {
    method: "DELETE",
    headers: auth(nonMember),
  });
  assert.equal(deniedDelete.status, 403);

  const deleteResponse = await request(`/chats/${managed.id}/messages/${sent.id}`, {
    method: "DELETE",
    headers: auth(member),
  });
  assert.equal(deleteResponse.status, 204);
  const history = await request(`/chats/${managed.id}/messages`, { headers: auth(member) });
  assert.equal((await history.json() as { id: string }[]).some(({ id }) => id === sent.id), false);

  const removeResponse = await request(`/chats/${managed.id}/members/${nonMember.id}`, {
    method: "DELETE",
    headers: auth(admin),
  });
  assert.equal(removeResponse.status, 204);
  const deniedAfterRemoval = await request(`/chats/${managed.id}/messages`, { headers: auth(nonMember) });
  assert.equal(deniedAfterRemoval.status, 403);
});

test("only admins can delete an existing channel or group chat for everyone", async () => {
  const conversation = await seedExistingConversation("group", "Deletable group");
  deletableConversationId = conversation.id;

  const messageResponse = await request(`/chats/${conversation.id}/messages`, {
    method: "POST",
    headers: auth(member),
    body: JSON.stringify({ text: "This history is deleted with the group." }),
  });
  assert.equal(messageResponse.status, 201);

  const deniedDelete = await request(`/chats/${conversation.id}`, { method: "DELETE", headers: auth(member) });
  assert.equal(deniedDelete.status, 403);

  const deleteResponse = await request(`/chats/${conversation.id}`, { method: "DELETE", headers: auth(admin) });
  assert.equal(deleteResponse.status, 204);
  deletableConversationId = "";

  const memberChats = await request("/chats", { headers: auth(member) });
  assert.equal((await memberChats.json() as { id: string }[]).some(({ id }) => id === conversation.id), false);
  const deletedMessages = await db.select().from(messagesTable).where(eq(messagesTable.conversationId, conversation.id));
  assert.equal(deletedMessages.length, 0);
});

test("an admin can invite, activate, and sign in a new user", async () => {
  const email = `invite-flow-${suffix}@example.com`;
  const inviteResponse = await request("/admin/invites", {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({
      fullName: "Invited Flow User",
      email,
      phone: "(602) 555-0182",
      role: "Athlete",
      teams: ["Varsity"],
    }),
  });
  assert.equal(inviteResponse.status, 201);
  const invited = await inviteResponse.json() as { id: string; status: string; email: string };
  invitedUserId = invited.id;
  assert.deepEqual({ status: invited.status, email: invited.email }, { status: "invited", email });
  await db.update(usersTable).set({ email: `Invite-Flow-${suffix}@EXAMPLE.COM` }).where(eq(usersTable.id, invited.id));

  const lookupResponse = await request("/onboarding/lookup", {
    method: "POST",
    body: JSON.stringify({ identifier: email }),
  });
  assert.equal(lookupResponse.status, 200);
  const lookup = await lookupResponse.json() as { found: boolean; state: string; user: { id: string; role: string } | null };
  assert.equal(lookup.found, true);
  assert.equal(lookup.state, "ready");
  assert.deepEqual(lookup.user && { id: lookup.user.id, role: lookup.user.role }, { id: invited.id, role: "Athlete" });

  const phoneLookupResponse = await request("/onboarding/lookup", {
    method: "POST",
    body: JSON.stringify({ identifier: "602-555-0182" }),
  });
  const phoneLookup = await phoneLookupResponse.json() as { found: boolean; state: string; user: { id: string } | null };
  assert.equal(phoneLookup.found, true);
  assert.equal(phoneLookup.state, "ready");
  assert.equal(phoneLookup.user?.id, invited.id);

  const completeResponse = await request("/onboarding/complete", {
    method: "POST",
    body: JSON.stringify({ userId: invited.id, fullName: "Invited Flow User", password: "invite-password-123" }),
  });
  assert.equal(completeResponse.status, 200);
  const completed = await completeResponse.json() as { user: { status: string; id: string }; sessionToken: string };
  assert.equal(completed.user.id, invited.id);
  assert.equal(completed.user.status, "active");
  assert.ok(completed.sessionToken);

  const reusedLookupResponse = await request("/onboarding/lookup", {
    method: "POST",
    body: JSON.stringify({ identifier: email }),
  });
  assert.equal(reusedLookupResponse.status, 200);
  const reusedLookup = await reusedLookupResponse.json() as { found: boolean; state: string };
  assert.equal(reusedLookup.found, false);
  assert.equal(reusedLookup.state, "completed");

  const signInResponse = await request("/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ identifier: email.toUpperCase(), password: "invite-password-123" }),
  });
  assert.equal(signInResponse.status, 200);
  const signedIn = await signInResponse.json() as { sessionToken: string; user: { id: string; status: string } };
  assert.ok(signedIn.sessionToken);
  assert.deepEqual({ id: signedIn.user.id, status: signedIn.user.status }, { id: invited.id, status: "active" });
});

test("expired and revoked invitations return actionable lookup states", async () => {
  const expiredEmail = `expired-invite-${suffix}@example.com`;
  const expiredInvite = await request("/admin/invites", {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({ fullName: "Expired Invite", email: expiredEmail, role: "Parent-Athlete" }),
  });
  assert.equal(expiredInvite.status, 201);
  const expired = await expiredInvite.json() as { id: string };
  expiredUserId = expired.id;
  await db.update(usersTable).set({ inviteTokenExpiresAt: new Date(0) }).where(eq(usersTable.id, expired.id));
  const expiredLookup = await request("/onboarding/lookup", { method: "POST", body: JSON.stringify({ identifier: expiredEmail }) });
  assert.deepEqual(await expiredLookup.json(), { found: false, state: "expired", user: null });

  const revokedEmail = `revoked-invite-${suffix}@example.com`;
  const revokedInvite = await request("/admin/invites", {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({ fullName: "Revoked Invite", email: revokedEmail, role: "Parent-Athlete" }),
  });
  assert.equal(revokedInvite.status, 201);
  const revoked = await revokedInvite.json() as { id: string };
  revokedUserId = revoked.id;
  const revokeResponse = await request(`/admin/invites/${revoked.id}/revoke`, { method: "POST", headers: auth(admin) });
  assert.equal(revokeResponse.status, 200);
  const revokedLookup = await request("/onboarding/lookup", { method: "POST", body: JSON.stringify({ identifier: revokedEmail }) });
  assert.deepEqual(await revokedLookup.json(), { found: false, state: "revoked", user: null });
});

test("admins and Staff-Coach users can manage the dashboard API while athletes cannot", async () => {
  const invalidDate = await request("/admin/calendar-events", {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({ title: "Invalid event", date: "2026-02-30", time: "4:00 PM", location: "East Field", team: "Varsity" }),
  });
  assert.equal(invalidDate.status, 400);

  const malformedDate = await request("/admin/calendar-events", {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({ title: "Malformed event", date: "2026-13-01", time: "4:00 PM", location: "East Field", team: "Varsity" }),
  });
  assert.equal(malformedDate.status, 400);

  const activeRevoke = await request(`/admin/invites/${admin.id}/revoke`, { method: "POST", headers: auth(admin) });
  assert.equal(activeRevoke.status, 409);

  const activeAdminCount = (await db.select().from(usersTable)).filter((user) => user.role === "Admin" && user.status === "active").length;
  if (activeAdminCount === 1) {
    const lastAdmin = await request(`/admin/users/${admin.id}/role`, {
      method: "PATCH",
      headers: auth(admin),
      body: JSON.stringify({ role: "Staff-Coach" }),
    });
    assert.equal(lastAdmin.status, 409);
  }

  const deniedCalendar = await request("/admin/calendar-events", { headers: auth(member) });
  assert.equal(deniedCalendar.status, 403);

  const roleResponse = await request(`/admin/users/${member.id}/role`, {
    method: "PATCH",
    headers: auth(admin),
    body: JSON.stringify({ role: "Staff-Coach" }),
  });
  assert.equal(roleResponse.status, 200);
  const updatedMember = await roleResponse.json() as { id: string; role: string };
  assert.deepEqual({ id: updatedMember.id, role: updatedMember.role }, { id: member.id, role: "Staff-Coach" });

  const staffCalendar = await request("/admin/calendar-events", { headers: auth(member) });
  assert.equal(staffCalendar.status, 200);

  const createResponse = await request("/admin/calendar-events", {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({
      title: "Admin dashboard calendar test",
      date: "2026-09-01",
      time: "4:00 PM - 6:30 PM",
      location: "East Field",
      team: "Varsity",
    }),
  });
  assert.equal(createResponse.status, 201);
  const event = await createResponse.json() as { id: string; title: string; team: string };
  calendarEventId = event.id;
  assert.deepEqual({ title: event.title, team: event.team }, { title: "Admin dashboard calendar test", team: "Varsity" });

  const initialFeedResponse = await request("/calendar.ics?team=varsity");
  assert.equal(initialFeedResponse.status, 200);
  assert.match(initialFeedResponse.headers.get("content-type") ?? "", /text\/calendar/);
  const initialFeed = await initialFeedResponse.text();
  assert.match(initialFeed, /BEGIN:VCALENDAR/);
  assert.match(initialFeed, /SUMMARY:Admin dashboard calendar test/);
  assert.match(initialFeed, new RegExp(`UID:${event.id}@lpahub`));
  assert.match(initialFeed, /DTEND;TZID=America\/Phoenix:20260901T183000/);

  const lpaEventResponse = await request("/admin/calendar-events", {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({
      title: "LPA community event",
      date: "2026-09-02",
      time: "9:00 AM",
      location: "LPA Campus",
      team: "LPA Events",
    }),
  });
  assert.equal(lpaEventResponse.status, 201);
  const lpaEvent = await lpaEventResponse.json() as { id: string };
  teamCalendarEventIds.push(lpaEvent.id);

  const sharedResponse = await request("/calendar-events", { headers: auth(member) });
  assert.equal(sharedResponse.status, 200);
  const sharedEvents = await sharedResponse.json() as { id: string }[];
  assert.equal(sharedEvents.some(({ id }) => id === event.id), true);
  assert.equal(sharedEvents.some(({ id }) => id === lpaEvent.id), true);

  const filteredResponse = await request("/admin/calendar-events?team=Varsity", { headers: auth(admin) });
  assert.equal(filteredResponse.status, 200);
  const filteredEvents = await filteredResponse.json() as { id: string }[];
  assert.equal(filteredEvents.some(({ id }) => id === event.id), true);

  const updateResponse = await request(`/admin/calendar-events/${event.id}`, {
    method: "PATCH",
    headers: auth(admin),
    body: JSON.stringify({ title: "Updated dashboard event", date: "2026-09-01", time: "5:00 PM", location: "West Field", team: "Varsity" }),
  });
  assert.equal(updateResponse.status, 200);
  const updatedEvent = await updateResponse.json() as { title: string; time: string; location: string };
  assert.deepEqual(
    { title: updatedEvent.title, time: updatedEvent.time, location: updatedEvent.location },
    { title: "Updated dashboard event", time: "5:00 PM", location: "West Field" },
  );

  const updatedFeedResponse = await request("/calendar.ics?team=varsity");
  const updatedFeed = await updatedFeedResponse.text();
  assert.match(updatedFeed, /SUMMARY:Updated dashboard event/);
  assert.doesNotMatch(updatedFeed, /SUMMARY:Admin dashboard calendar test/);

  const deleteResponse = await request(`/admin/calendar-events/${event.id}`, { method: "DELETE", headers: auth(admin) });
  assert.equal(deleteResponse.status, 204);
  calendarEventId = "";
  const deletedFeedResponse = await request("/calendar.ics?team=varsity");
  const deletedFeed = await deletedFeedResponse.text();
  assert.doesNotMatch(deletedFeed, /SUMMARY:Updated dashboard event/);

  const invalidFeed = await request("/calendar.ics?team=not-a-team");
  assert.equal(invalidFeed.status, 404);
});

test("all team ICS feeds reflect events created by an admin", async () => {
  const feeds = [
    { team: "14u", slug: "14u" },
    { team: "Junior Varsity", slug: "lpa-jv" },
    { team: "LPA Events", slug: "lpa-events" },
    { team: "15u", slug: "15u" },
  ];

  for (const { team, slug } of feeds) {
    const title = `ICS ${team} sync ${suffix}`;
    const createResponse = await request("/admin/calendar-events", {
      method: "POST",
      headers: auth(admin),
      body: JSON.stringify({ title, date: "2026-08-20", time: "4:00 PM", location: "LPA Campus", team }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as { id: string; team: string };
    teamCalendarEventIds.push(created.id);
    assert.equal(created.team, team);

    const feedResponse = await request(`/calendar.ics?team=${slug}`);
    assert.equal(feedResponse.status, 200);
    assert.match(feedResponse.headers.get("content-type") ?? "", /text\/calendar/);
    assert.match(await feedResponse.text(), new RegExp(`SUMMARY:ICS ${team} sync ${suffix}`));
  }
});