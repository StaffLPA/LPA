import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { activeChatIdFromPath, addDismissed, everyoneDismissedKey, pendingEveryoneAlerts, type EveryoneMentionChat } from '@/lib/everyoneMentionAlerts';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import { useListChats, getListAnnouncementsQueryKey, getListAdminAnnouncementsQueryKey } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { addPushReceivedListener, addPushResponseListener, setApplicationBadgeCount } from '@/lib/messagePushNotifications';
import { CHAT_LIST_REFRESH_INTERVAL_MS } from '@/lib/chatListRefresh';

type Chat = EveryoneMentionChat & {
  unreadCount: number;
};

export function MessageNotificationCenter() {
  const { user } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const chats = useListChats({ query: { queryKey: ['chats'], enabled: Boolean(user), refetchInterval: CHAT_LIST_REFRESH_INTERVAL_MS } });
  const unreadCount = ((chats.data ?? []) as Chat[]).reduce((total, chat) => total + chat.unreadCount, 0);

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const userId = user?.id;
  // Dismissed mention IDs are scoped to the signed-in account and persisted locally.
  const [dismissed, setDismissed] = useState<{ owner: string | undefined; ids: string[]; loaded: boolean }>({ owner: undefined, ids: [], loaded: false });
  useEffect(() => {
    if (!userId) { setDismissed({ owner: undefined, ids: [], loaded: false }); return; }
    let active = true;
    setDismissed({ owner: userId, ids: [], loaded: false });
    void AsyncStorage.getItem(everyoneDismissedKey(userId)).then((raw) => {
      let ids: string[] = [];
      try { const parsed = JSON.parse(raw ?? '[]'); if (Array.isArray(parsed)) ids = parsed.filter((item): item is string => typeof item === 'string'); } catch { /* ignore */ }
      if (active) setDismissed((current) => current.owner === userId ? { owner: userId, ids: [...new Set([...ids, ...current.ids])], loaded: true } : current);
    }).catch(() => { if (active) setDismissed((current) => current.owner === userId ? { ...current, loaded: true } : current); });
    return () => { active = false; };
  }, [userId]);
  const dismissMention = (mentionId: string) => {
    if (!userId) return;
    setDismissed((current) => {
      if (current.owner !== userId) return current;
      const ids = addDismissed(current.ids, mentionId);
      void AsyncStorage.setItem(everyoneDismissedKey(userId), JSON.stringify(ids)).catch(() => undefined);
      return { ...current, ids };
    });
  };
  const activeConversationId = activeChatIdFromPath(pathname);
  const alerts = useMemo(() => {
    if (!userId || dismissed.owner !== userId || !dismissed.loaded) return [];
    return pendingEveryoneAlerts((chats.data ?? []) as Chat[], new Set(dismissed.ids), activeConversationId);
  }, [activeConversationId, chats.data, dismissed, userId]);
  const current = alerts[0];

  useEffect(() => {
    if (user && chats.data === undefined) return;
    void setApplicationBadgeCount(user ? unreadCount : 0).catch(() => undefined);
  }, [chats.data, unreadCount, user]);

  useEffect(() => {
    const invalidateChat = (conversationId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      if (pathname === `/chat/${conversationId}`) void queryClient.invalidateQueries({ queryKey: ['chat-messages', conversationId] });
    };
    const response = addPushResponseListener((data) => {
      if (data.formSubmissionId) {
        const target = `/forms/${data.formSubmissionId}`;
        void queryClient.invalidateQueries({ queryKey: ['/api/forms/submissions'] });
        router.push(target as never);
      } else if (data.conversationId) {
        invalidateChat(data.conversationId);
        router.push(('/chat/' + data.conversationId) as never);
      } else if (data.announcementId) {
        router.push(`/?announcementId=${data.announcementId}` as never);
      }
    });
    const received = addPushReceivedListener((notification) => {
      if (notification.formSubmissionId) {
        void queryClient.invalidateQueries({ queryKey: ['/api/forms/submissions'] });
        void queryClient.invalidateQueries({ queryKey: ['/api/forms/notifications'] });
        void queryClient.invalidateQueries({ queryKey: ['chats'] });
      } else if (notification.conversationId) {
        invalidateChat(notification.conversationId);
      } else if (notification.announcementId) {
        void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
      }
    });
    return () => { response.remove(); received.remove(); };
  }, [pathname, queryClient, router]);

  if (!current) return null;
  return <View pointerEvents="box-none" style={[bannerStyles.layer, { top: Math.max(insets.top, Platform.OS === 'web' ? 12 : 0) + 8 }]}>
    <View key={current.mentionId} testID="everyone-mention-banner" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[bannerStyles.banner, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.primary }]}>
      <View style={[bannerStyles.icon, { backgroundColor: colors.primary }]}><Feather name="users" size={16} color="#fff" /></View>
      <View style={bannerStyles.body}>
        <Text style={[bannerStyles.eyebrow, { color: colors.primary }]}>MENTIONED EVERYONE{alerts.length > 1 ? ` · ${alerts.length - 1} MORE` : ''}</Text>
        <Text numberOfLines={1} style={[bannerStyles.title, { color: colors.foreground }]}>@everyone in {current.name}</Text>
      </View>
      <Pressable testID="everyone-mention-open" accessibilityRole="button" accessibilityLabel={`Open ${current.name}`} onPress={() => { dismissMention(current.mentionId); router.push(('/chat/' + current.conversationId) as never); }} style={[bannerStyles.open, { backgroundColor: colors.primary }]}>
        <Text style={bannerStyles.openText}>Open</Text>
      </Pressable>
      <Pressable testID="everyone-mention-dismiss" accessibilityRole="button" accessibilityLabel="Dismiss mention alert" hitSlop={8} onPress={() => dismissMention(current.mentionId)} style={bannerStyles.dismiss}>
        <Feather name="x" size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  </View>;
}

const bannerStyles = StyleSheet.create({
  layer: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1000, elevation: 20 },
  banner: { width: '100%', maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderLeftWidth: 4, borderRadius: 16, paddingVertical: 10, paddingLeft: 12, paddingRight: 8, shadowColor: '#0B1B33', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  icon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 2 },
  open: { minHeight: 34, paddingHorizontal: 13, borderRadius: 10, justifyContent: 'center' },
  openText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  dismiss: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
});