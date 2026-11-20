import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { chatDraftKey, chatDraftUserPrefix, conversationIdFromDraftKey, parseDraft, serializeDraft, type DraftMention, type StoredDraft } from './chatDraft';

type Listener = (userId: string) => void;
const listeners = new Set<Listener>();
const notify = (userId: string) => listeners.forEach((listener) => listener(userId));
// Flushes, debounce writes and successful-send deletion can overlap. Preserve
// invocation order per key so an older write cannot resurrect a cleared draft.
const writes = new Map<string, Promise<void>>();

export async function loadChatDraft(userId: string, conversationId: string): Promise<StoredDraft | null> {
  const key = chatDraftKey(userId, conversationId);
  // Wait for any queued flush for this key so reopening a chat reads the latest draft.
  try { await writes.get(key); } catch { /* ignore */ }
  try { return parseDraft(await AsyncStorage.getItem(key)); } catch { return null; }
}

export async function saveChatDraft(userId: string, conversationId: string, text: string, mentions: DraftMention[]) {
  const key = chatDraftKey(userId, conversationId);
  const serialized = serializeDraft(text, mentions);
  const write = (writes.get(key) ?? Promise.resolve()).then(async () => {
    try {
      if (serialized) await AsyncStorage.setItem(key, serialized);
      else await AsyncStorage.removeItem(key);
    } catch { /* Drafts are best effort; never block messaging. */ }
    notify(userId);
  });
  writes.set(key, write);
  try { await write; } finally { if (writes.get(key) === write) writes.delete(key); }
}

export async function loadAllChatDrafts(userId: string): Promise<Record<string, string>> {
  try {
    const prefix = chatDraftUserPrefix(userId);
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
    if (!keys.length) return {};
    const entries = await AsyncStorage.multiGet(keys);
    const drafts: Record<string, string> = {};
    for (const [key, raw] of entries) {
      const conversationId = conversationIdFromDraftKey(userId, key);
      const draft = parseDraft(raw);
      if (conversationId && draft) drafts[conversationId] = draft.text;
    }
    return drafts;
  } catch { return {}; }
}

/** Draft text keyed by conversation for the signed-in user; refreshes on any local save. */
export function useChatDrafts(userId: string | undefined) {
  const [drafts, setDrafts] = useState<{ owner: string | undefined; values: Record<string, string> }>({ owner: undefined, values: {} });
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refresh = () => { void loadAllChatDrafts(userId).then((values) => { if (active) setDrafts({ owner: userId, values }); }); };
    refresh();
    const listener: Listener = (changed) => { if (changed === userId) refresh(); };
    listeners.add(listener);
    return () => { active = false; listeners.delete(listener); };
  }, [userId]);
  // Never expose another account's drafts while the new account's drafts load.
  return drafts.owner === userId ? drafts.values : {};
}
