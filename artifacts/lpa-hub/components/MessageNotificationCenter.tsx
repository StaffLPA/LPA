import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useListChats } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { addPushReceivedListener, addPushResponseListener } from '@/lib/messagePushNotifications';

type Chat = {
  id: string;
  name: string;
  members: { id: string; fullName: string }[];
  lastMessage: { id: string; senderId: string; text: string } | null;
};
type AlertMessage = { conversationId: string; messageId: string; title: string; body: string };

const seenKey = (userId: string) => `lpa-seen-message-notifications:${userId}`;

export function MessageNotificationCenter() {
  const colors = useColors();
  const { user } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const chats = useListChats({ query: { queryKey: ['chats'], enabled: Boolean(user) } });
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const [isReady, setIsReady] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const baselineReadyRef = useRef(false);

  const persistSeen = useCallback(() => {
    if (!user) return;
    const values = [...seenRef.current].slice(-300);
    void AsyncStorage.setItem(seenKey(user.id), JSON.stringify(values));
  }, [user]);

  const remember = useCallback((messageId: string) => {
    if (!messageId) return;
    seenRef.current.add(messageId);
    persistSeen();
  }, [persistSeen]);

  const show = useCallback((next: AlertMessage) => {
    if (!next.messageId || seenRef.current.has(next.messageId)) return;
    if (pathname === `/chat/${next.conversationId}`) {
      remember(next.messageId);
      return;
    }
    remember(next.messageId);
    setAlert(next);
  }, [pathname, remember]);

  useEffect(() => {
    initializedRef.current = false;
    baselineReadyRef.current = false;
    setIsReady(false);
    seenRef.current = new Set();
    setAlert(null);
    if (!user) return;
    let mounted = true;
    void AsyncStorage.getItem(seenKey(user.id)).then((stored) => {
      if (!mounted) return;
      try {
        seenRef.current = new Set((JSON.parse(stored ?? '[]') as unknown[]).filter((value): value is string => typeof value === 'string'));
      } catch {
        seenRef.current = new Set();
      }
      initializedRef.current = true;
      setIsReady(true);
    });
    return () => { mounted = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user || !initializedRef.current || !isReady) return;
    const currentChats = (chats.data ?? []) as Chat[];
    if (!baselineReadyRef.current) {
      currentChats.forEach((chat) => chat.lastMessage && remember(chat.lastMessage.id));
      baselineReadyRef.current = true;
      return;
    }
    for (const chat of currentChats) {
      const last = chat.lastMessage;
      if (!last) continue;
      if (last.senderId === user.id) {
        remember(last.id);
        continue;
      }
      const sender = chat.members.find((member) => member.id === last.senderId)?.fullName ?? 'LPA member';
      show({ conversationId: chat.id, messageId: last.id, title: `${sender} · ${chat.name}`, body: last.text || 'Sent an attachment' });
    }
  }, [chats.data, isReady, remember, show, user]);

  useEffect(() => {
    const invalidate = (conversationId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      if (pathname === `/chat/${conversationId}`) void queryClient.invalidateQueries({ queryKey: ['chat-messages', conversationId] });
    };
    const response = addPushResponseListener((conversationId) => {
      invalidate(conversationId);
      router.push(('/chat/' + conversationId) as never);
    });
    const received = addPushReceivedListener((notification) => {
      invalidate(notification.conversationId);
      show({
        conversationId: notification.conversationId,
        messageId: notification.messageId ?? `push-${notification.conversationId}-${notification.body}`,
        title: notification.title,
        body: notification.body,
      });
    });
    return () => { response.remove(); received.remove(); };
  }, [pathname, queryClient, router, show]);

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 7_000);
    return () => clearTimeout(timer);
  }, [alert]);

  if (!alert) return null;
  return (
    <Pressable
      testID="message-notification-alert"
      accessibilityRole="button"
      onPress={() => {
        setAlert(null);
        router.push(('/chat/' + alert.conversationId) as never);
      }}
      style={[styles.container, { backgroundColor: colors.foreground }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primary }]}><Feather name="message-circle" size={17} color="#fff" /></View>
      <View style={styles.copy}><Text numberOfLines={1} style={[styles.title, { color: colors.background }]}>{alert.title}</Text><Text numberOfLines={2} style={[styles.body, { color: colors.background }]}>{alert.body}</Text></View>
      <Feather name="chevron-right" size={18} color={colors.background} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, bottom: 94, minHeight: 64, borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 12, opacity: 0.84 },
});