export type EveryoneMentionChat = {
  id: string;
  name: string;
  type?: string;
  isMuted?: boolean;
  muteMode?: 'unmuted' | 'all' | 'mentions';
  unreadEveryoneMentionId?: string | null;
  lastMessage?: { createdAt: string } | null;
  createdAt?: string;
};
export type EveryoneMentionAlert = { conversationId: string; mentionId: string; name: string };

export const EVERYONE_DISMISSED_LIMIT = 100;
export const everyoneDismissedKey = (userId: string) => `lpa-everyone-dismissed:v1:${encodeURIComponent(userId)}`;

/** Pending @everyone alerts, newest first. Keyed by mention ID so a later mention re-alerts after a dismissal. */
export function pendingEveryoneAlerts(chats: EveryoneMentionChat[], dismissed: ReadonlySet<string>, activeConversationId?: string | null): EveryoneMentionAlert[] {
  return chats
    .filter((chat) => {
      const muteMode = chat.muteMode ?? (chat.isMuted ? 'all' : 'unmuted');
      return chat.unreadEveryoneMentionId && muteMode !== 'all'
        && !dismissed.has(chat.unreadEveryoneMentionId) && chat.id !== activeConversationId;
    })
    .sort((a, b) => (Date.parse(b.lastMessage?.createdAt ?? b.createdAt ?? '') || 0) - (Date.parse(a.lastMessage?.createdAt ?? a.createdAt ?? '') || 0))
    .map((chat) => ({ conversationId: chat.id, mentionId: chat.unreadEveryoneMentionId as string, name: chat.name }));
}

export function addDismissed(current: string[], mentionId: string) {
  return [...current.filter((id) => id !== mentionId), mentionId].slice(-EVERYONE_DISMISSED_LIMIT);
}

export function activeChatIdFromPath(pathname: string | null | undefined) {
  const match = /^\/chat\/([^/?#]+)/.exec(pathname ?? '');
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}
