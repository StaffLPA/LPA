import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useListChats } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';

type Chat = { id: string; name: string; type: string; isPinned: boolean; unreadCount: number; members: { fullName: string }[]; lastMessage: { id: string; senderId: string; text: string; createdAt: string } | null };
type HiddenConversationMap = Record<string, number>;

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const chats = useListChats({ query: { queryKey: ['chats'] } });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [hiddenConversations, setHiddenConversations] = useState<HiddenConversationMap>({});
  const hiddenConversationsKey = user?.id ? `lpa-hidden-conversations:${user.id}` : null;
  useEffect(() => {
    setHiddenConversations({});
    if (!hiddenConversationsKey) return;
    let mounted = true;
    void AsyncStorage.getItem(hiddenConversationsKey).then((stored) => {
      if (!mounted || !stored) return;
      try {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const migrated: HiddenConversationMap = {};
          parsed.forEach((value) => {
            if (typeof value === 'string') migrated[value] = Date.now();
            else if (typeof value === 'object' && value !== null && 'id' in value && 'hiddenAt' in value && typeof value.id === 'string' && typeof value.hiddenAt === 'number') migrated[value.id] = value.hiddenAt;
          });
          setHiddenConversations(migrated);
        }
      } catch {
        // Invalid local data should never block access to server conversations.
      }
    });
    return () => { mounted = false; };
  }, [hiddenConversationsKey]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return ([...((chats.data ?? []) as Chat[])].filter((chat) => (
      (() => {
         if (chat.isPinned) return true;
        const hiddenAt = hiddenConversations[chat.id];
        if (hiddenAt === undefined) return true;
        const latestMessageAt = chat.lastMessage ? Date.parse(chat.lastMessage.createdAt) : Number.NaN;
        return Number.isFinite(latestMessageAt) && latestMessageAt > hiddenAt;
      })()
      &&
       (filter === 'Direct' ? chat.type === 'direct' : true)
      && (!normalizedQuery || chat.name.toLowerCase().includes(normalizedQuery) || chat.members.some((member) => member.fullName.toLowerCase().includes(normalizedQuery)))
     )).sort((a, b) => Number(b.isPinned) - Number(a.isPinned)));
  }, [chats.data, query, filter, hiddenConversations]);
  const hideConversationForMe = useCallback((conversationId: string) => {
    setHiddenConversations((current) => {
      const next = { ...current, [conversationId]: Date.now() };
      if (hiddenConversationsKey) void AsyncStorage.setItem(hiddenConversationsKey, JSON.stringify(next));
      return next;
    });
  }, [hiddenConversationsKey]);
  const confirmHideConversation = useCallback((conversationId: string) => {
    const complete = () => hideConversationForMe(conversationId);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete for me?\n\nThis conversation will be removed only from your view.')) complete();
      return;
    }
    Alert.alert('Delete for me?', 'This conversation will be removed only from your view. Other participants will still see the conversation and its messages.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', style: 'destructive', onPress: complete }]);
  }, [hideConversationForMe]);
  const openConversation = useCallback((conversationId: string) => router.push(('/chat/' + conversationId) as never), [router]);
  const renderConversation = useCallback(({ item }: { item: Chat }) => <ConversationRow item={item} colors={colors} onOpen={openConversation} onDelete={confirmHideConversation} />, [colors, confirmHideConversation, openConversation]);
  const conversationKey = useCallback((item: Chat) => item.id, []);
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={{ paddingTop: insets.top + 18 }}>
      <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>TEAM COMMUNICATION</Text><Text style={[styles.title, { color: colors.foreground }]}>Messages</Text></View><Pressable testID="new-chat" style={[styles.compose, { backgroundColor: colors.primary }]} onPress={() => router.push('/new-chat')}><Feather name="edit-3" size={18} color="#fff" /></Pressable></View>
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={17} color={colors.mutedForeground} /><TextInput testID="message-search" value={query} onChangeText={setQuery} placeholder="Search conversations" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View>
       <View style={styles.filters}>{['All', 'Direct'].map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, { backgroundColor: filter === item ? colors.foreground : colors.card, borderColor: colors.border }]}><Text style={[styles.filterText, { color: filter === item ? colors.background : colors.mutedForeground }]}>{item}</Text></Pressable>)}</View>
    </View>
      {chats.isLoading ? <ActivityIndicator style={{ marginTop: 50 }} color={colors.primary} /> : chats.isError ? <State title="Unable to load conversations" copy="Check your connection and try again." colors={colors} onRetry={() => void chats.refetch()} /> : <FlatList data={filtered} keyExtractor={conversationKey} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30, paddingTop: 10 }} renderItem={renderConversation} removeClippedSubviews={Platform.OS === 'android'} initialNumToRender={10} maxToRenderPerBatch={8} windowSize={7} updateCellsBatchingPeriod={50} getItemLayout={(_, index) => ({ length: 76, offset: 76 * index, index })} ListEmptyComponent={<State title="No conversations yet" copy="Start a private direct message with an active LPA member." colors={colors} />} />}
  </View>;
}

const ConversationRow = React.memo(function ConversationRow({ item, colors, onOpen, onDelete }: {
  item: Chat;
  colors: ReturnType<typeof useColors>;
  onOpen: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
}) {
  const SwipeableRow = Platform.OS === 'web' ? Swipeable : ReanimatedSwipeable;
  return <SwipeableRow
    testID={`swipe-delete-conversation-${item.id}`}
    renderRightActions={item.isPinned ? undefined : () => <Pressable testID={`delete-for-me-conversation-${item.id}`} accessibilityRole="button" onPress={() => onDelete(item.id)} style={[styles.swipeAction, { backgroundColor: colors.destructive }]}><Feather name="trash-2" size={15} color="#fff" /><Text style={styles.swipeActionText}>Delete for me</Text></Pressable>}
    overshootRight={false}
    rightThreshold={80}
    friction={2}
    containerStyle={styles.swipeContainer}
  >
    <Pressable onPress={() => onOpen(item.id)} style={({ pressed }) => [styles.conversation, { borderBottomColor: colors.border, backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.initials, { backgroundColor: `${colors.primary}20` }]}><Text style={[styles.initialsText, { color: colors.primary }]}>{item.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text></View><View style={{ flex: 1 }}><View style={styles.row}><Text style={[styles.sender, { color: colors.foreground }, item.unreadCount > 0 && styles.unreadText]}>{item.name}</Text><View style={styles.meta}><Text style={[styles.time, { color: colors.mutedForeground }]}>{item.type === 'direct' ? 'direct' : item.type}</Text>{item.isPinned ? <Feather name="bookmark" size={13} color={colors.primary} /> : null}{item.unreadCount > 0 ? <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}><Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View> : null}</View></View><Text numberOfLines={1} style={[styles.preview, { color: item.unreadCount > 0 ? colors.foreground : colors.mutedForeground }, item.unreadCount > 0 && styles.unreadText]}>{item.lastMessage?.text ?? 'No messages yet'}</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable>
  </SwipeableRow>;
});

function State({ title, copy, colors, onRetry }: { title: string; copy: string; colors: ReturnType<typeof useColors>; onRetry?: () => void }) {
  return <View style={styles.empty}><Feather name="message-square" size={28} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{copy}</Text>{onRetry ? <Pressable onPress={onRetry} style={[styles.retry, { borderColor: colors.border }]}><Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 }, title: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 5 }, compose: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }, search: { height: 43, marginHorizontal: 18, marginTop: 18, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }, searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13 }, filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, marginTop: 14, marginBottom: 2 }, filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16, borderWidth: 1 }, filterText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, swipeContainer: { borderRadius: 16, overflow: 'hidden' }, swipeAction: { width: 110, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }, swipeActionText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 10, textAlign: 'center' }, conversation: { minHeight: 76, paddingVertical: 15, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }, initials: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, initialsText: { fontFamily: 'Inter_700Bold', fontSize: 13 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }, meta: { flexDirection: 'row', alignItems: 'center', gap: 6 }, sender: { fontFamily: 'Inter_700Bold', fontSize: 13 }, time: { fontFamily: 'Inter_400Regular', fontSize: 10 }, preview: { fontFamily: 'Inter_400Regular', fontSize: 12, paddingRight: 4 }, unreadText: { fontFamily: 'Inter_700Bold' }, unreadBadge: { minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }, unreadBadgeText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 10 }, empty: { alignItems: 'center', paddingTop: 80, gap: 8, paddingHorizontal: 30 }, emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 6 }, emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' }, retry: { marginTop: 7, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 }, retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});