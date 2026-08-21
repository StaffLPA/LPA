import { logger } from "./logger";
import { db, pushDevicesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

export type MessagePushNotification = {
  tokens: string[];
  title: string;
  body: string;
  conversationId: string;
  messageId: string;
};

type MessagePushSender = (notification: MessagePushNotification) => Promise<void>;

function isExpoPushToken(token: string) {
  return /^(?:Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
}

type ExpoPushTicket = {
  id?: unknown;
  status?: unknown;
  details?: { error?: unknown };
};

type ExpoPushReceipt = {
  status?: unknown;
  details?: { error?: unknown };
};

function isDeviceNotRegistered(response: ExpoPushReceipt | ExpoPushTicket) {
  return response.status === "error" && response.details?.error === "DeviceNotRegistered";
}

function isDeviceNotRegisteredReceipt(receipt: ExpoPushReceipt | ExpoPushTicket) {
  return isDeviceNotRegistered(receipt);
}

async function removeInvalidPushDevices(tokens: string[]) {
  if (!tokens.length) return;
  try {
    await db.delete(pushDevicesTable).where(inArray(pushDevicesTable.expoPushToken, tokens));
    logger.info({ tokensRemoved: tokens.length }, "Removed unregistered Expo push devices");
  } catch (error) {
    logger.warn({ err: error, tokensRemoved: tokens.length }, "Failed to remove unregistered Expo push devices");
  }
}

async function processExpoPushReceipts(receiptTokens: Map<string, string>) {
  if (!receiptTokens.size) return;
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...receiptTokens.keys()] }),
    });
    if (!response.ok) throw new Error(`Expo push receipt request failed (${response.status}).`);

    const payload = await response.json() as { data?: Record<string, ExpoPushReceipt> };
    const invalidTokens = [...receiptTokens.entries()]
      .filter(([receiptId, token]) => isDeviceNotRegisteredReceipt(payload.data?.[receiptId] ?? {}) && Boolean(token))
      .map(([, token]) => token);
    await removeInvalidPushDevices([...new Set(invalidTokens)]);
  } catch (error) {
    logger.warn({ err: error, receiptCount: receiptTokens.size }, "Expo push receipt processing failed");
  }
}

async function sendExpoPushNotification(notification: MessagePushNotification) {
  const messages = notification.tokens
    .filter(isExpoPushToken)
    .map((to) => ({
      to,
      sound: "default",
      channelId: "messages",
      title: notification.title,
      body: notification.body,
      data: { conversationId: notification.conversationId, messageId: notification.messageId },
    }));

  for (let start = 0; start < messages.length; start += 100) {
    const batch = messages.slice(start, start + 100);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`Expo push request failed (${response.status}).`);
    const payload = await response.json() as { data?: ExpoPushTicket[] };
    const invalidTicketTokens = (payload.data ?? [])
      .map((ticket, index) => isDeviceNotRegistered(ticket) ? batch[index]?.to : undefined)
      .filter((token): token is string => typeof token === "string");
    await removeInvalidPushDevices([...new Set(invalidTicketTokens)]);
    const receiptTokens = new Map(
      (payload.data ?? [])
        .map((ticket, index) => [ticket.id, batch[index]?.to] as const)
        .filter((entry): entry is readonly [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"),
    );
    void processExpoPushReceipts(receiptTokens);
  }
}

let messagePushSender: MessagePushSender = sendExpoPushNotification;

export function setMessagePushSenderForTests(sender?: MessagePushSender) {
  messagePushSender = sender ?? sendExpoPushNotification;
}

export async function sendMessagePushNotification(notification: MessagePushNotification) {
  if (!notification.tokens.length) return;
  try {
    await messagePushSender(notification);
  } catch (error) {
    logger.warn({ err: error, conversationId: notification.conversationId, messageId: notification.messageId }, "Message push notification failed");
    throw error;
  }
}