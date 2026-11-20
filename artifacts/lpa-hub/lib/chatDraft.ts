// Pure helpers for private, per-device chat drafts. Keys are scoped to the
// signed-in user AND conversation so accounts on a shared device never mix.
export type DraftMention = { userId: string; displayName: string; start: number; end: number };
export type StoredDraft = { text: string; mentions: DraftMention[]; updatedAt: number };

export const CHAT_DRAFT_PREFIX = 'lpa-chat-draft:v1:';
export const CHAT_DRAFT_DEBOUNCE_MS = 500;

export function chatDraftUserPrefix(userId: string) {
  return `${CHAT_DRAFT_PREFIX}${encodeURIComponent(userId)}:`;
}

export function chatDraftKey(userId: string, conversationId: string) {
  return `${chatDraftUserPrefix(userId)}${encodeURIComponent(conversationId)}`;
}

export function conversationIdFromDraftKey(userId: string, key: string): string | null {
  const prefix = chatDraftUserPrefix(userId);
  if (!key.startsWith(prefix)) return null;
  try { return decodeURIComponent(key.slice(prefix.length)) || null; } catch { return null; }
}

export function isEmptyDraft(text: string) {
  return !text.trim();
}

export function validDraftMentions(text: string, mentions: unknown): DraftMention[] {
  if (!Array.isArray(mentions)) return [];
  return mentions.filter((item): item is DraftMention => Boolean(item) && typeof item === 'object'
    && typeof item.userId === 'string' && typeof item.displayName === 'string'
    && Number.isInteger(item.start) && Number.isInteger(item.end)
    && item.start >= 0 && item.end <= text.length && item.end > item.start
    && text.slice(item.start, item.end) === `@${item.displayName}`)
    .sort((a, b) => a.start - b.start);
}

export function serializeDraft(text: string, mentions: DraftMention[], now = Date.now()): string | null {
  if (isEmptyDraft(text)) return null;
  return JSON.stringify({ text, mentions: validDraftMentions(text, mentions), updatedAt: now });
}

export function parseDraft(raw: string | null | undefined): StoredDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredDraft>;
    if (typeof value?.text !== 'string' || isEmptyDraft(value.text)) return null;
    return { text: value.text, mentions: validDraftMentions(value.text, value.mentions), updatedAt: Number(value.updatedAt) || 0 };
  } catch { return null; }
}

export function draftPreview(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}
