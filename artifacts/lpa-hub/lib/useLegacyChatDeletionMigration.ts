import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useEffect, useState } from 'react';

// Older builds hid conversations on this device only. Move those preferences
// to server tombstones once, without restoring previously hidden history.
export function useLegacyChatDeletionMigration(userId: string | undefined) {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    setHiddenIds([]);
    setError('');
    setLoading(true);
    if (!userId) { setLoading(false); return; }
    const key = `lpa-hidden-conversations:${userId}`;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(key);
        if (stopped || !stored) return;
        const parsed: unknown = JSON.parse(stored);
        const ids = [...new Set(Array.isArray(parsed)
          ? parsed.flatMap((entry) => typeof entry === 'string' ? [entry]
            : entry && typeof entry === 'object' && typeof entry.id === 'string' ? [entry.id] : [])
          : parsed && typeof parsed === 'object' ? Object.keys(parsed) : [])];
        setHiddenIds(ids);
        for (const id of ids) {
          if (stopped) return;
          try {
            await customFetch(`/api/chats/${encodeURIComponent(id)}`, { method: 'DELETE', signal: controller.signal });
          } catch (err) {
            const status = typeof err === 'object' && err !== null && 'status' in err ? Number(err.status) : 0;
            // Already removed or no longer a member; no accessible history remains.
            if (status !== 403 && status !== 404) throw err;
          }
        }
        if (stopped) return;
        await queryClient.cancelQueries({ queryKey: ['chats'] });
        queryClient.setQueryData<Array<{ id: string }>>(['chats'], (current = []) => current.filter((chat) => !ids.includes(chat.id)));
        for (const id of ids) queryClient.removeQueries({ queryKey: ['chat-messages', id] });
        await AsyncStorage.removeItem(key);
        setHiddenIds([]);
        void queryClient.invalidateQueries({ queryKey: ['chats'] });
      } catch {
        if (!stopped) setError('Previous conversation deletions could not sync to your account. Check your connection and retry.');
      } finally {
        if (!stopped) setLoading(false);
      }
    })();
    return () => { stopped = true; controller.abort(); };
  }, [userId, attempt, queryClient]);
  return { loading, hiddenIds, error, retry: () => setAttempt((value) => value + 1) };
}
