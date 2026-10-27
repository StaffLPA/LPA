import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useDeleteChat, useListChats } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { getChatMuteMode, useChatMute, type ChatMuteMode } from '@/lib/useChatMute';
import { visibleFormMessageText } from '@/lib/formMessageText';
import { ChatDeletionConfirmation } from '@/components/ChatDeletionConfirmation';
import { useLegacyChatDeletionMigration } from '@/lib/useLegacyChatDeletionMigration';
import { CHAT_LIST_REFRESH_INTERVAL_MS } from '@/lib/chatListRefresh';

type Chat = { id: string; name: string; type: string; isPinned: boolean; isMuted: boolean; muteMode?: ChatMuteMode; createdAt: string; unreadCount: number; members: { fullName: string }[]; lastMessage: { id: string; senderId: string; text: string; createdAt: string } | null };

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const queryClient = useQueryClient();
  const deleteChat = useDeleteChat();
  const legacy = useLegacyChatDeletionMigration(user?.id);
  const chats = useListChats({ query: { queryKey: ['chats'], refetchInterval: CHAT_LIST_REFRESH_INTERVAL_MS } });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [optionsId, setOptionsId] = useState<string | null>(null);
  const [muteError, setMuteError] = useState('');
   const { setMuteMode, isPending: mutePending } = useChatMute();
  useEffect(() => { setDeleteTarget(null); setDeleteError(''); setOptionsId(null); }, [user?.id]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return ((chats.data ?? []) as Chat[]).filter((chat) => (
       !legacy.hiddenIds.includes(chat.id)
      &&
       (filter === 'Direct' ? chat.type === 'direct' : true)
      && (!normalizedQuery || chat.name.toLowerCase().includes(normalizedQuery) || chat.members.some((member) => member.fullName.toLowerCase().includes(normalizedQuery)))
      ));
  }, [chats.data, query, filter, legacy.hiddenIds]);
  const sections = useMemo(() => {
    const ordered = [...filtered].sort((a, b) =>
      (Date.parse(b.lastMessage?.createdAt ?? b.createdAt) || 0) - (Date.parse(a.lastMessage?.createdAt ?? a.createdAt) || 0)
      || a.id.localeCompare(b.id));
    const pinned = ordered.filter((chat) => chat.type === 'group' && chat.isPinned);
    const other = ordered.filter((chat) => chat.type !== 'group' || !chat.isPinned);
    return [
      ...(pinned.length ? [{ title: 'Pinned Chats', data: pinned }] : []),
      ...(other.length ? [{ title: 'Other Chats', data: other }] : []),
    ];
  }, [filtered]);
  const confirmHideConversation = useCallback((conversationId: string) => {
    setOptionsId(null);
    setDeleteError('');
    setDeleteTarget(conversationId);
  }, []);
  const deleteConversation = () => {
    if (!deleteTarget || deleteChat.isPending) return;
    const conversationId = deleteTarget;
    setDeleteError('');
    deleteChat.mutate({ conversationId }, {
      onSuccess: async () => {
        await queryClient.cancelQueries({ queryKey: ['chats'] });
        await queryClient.cancelQueries({ queryKey: ['chat-messages', conversationId] });
        queryClient.setQueryData<Chat[]>(['chats'], (current = []) => current.filter((chat) => chat.id !== conversationId));
        queryClient.removeQueries({ queryKey: ['chat-messages', conversationId] });
        setDeleteTarget(null);
        void queryClient.invalidateQueries({ queryKey: ['chats'] });
      },
      onError: () => setDeleteError('Conversation not deleted. Check your connection and try again.'),
    });
  };
  const openConversation = useCallback((conversationId: string) => router.push(('/chat/' + conversationId) as never), [router]);
  const renderConversation = useCallback(({ item }: { item: Chat }) => <ConversationRow item={item} colors={colors} onOpen={openConversation} onDelete={confirmHideConversation} onOptions={setOptionsId} />, [colors, confirmHideConversation, openConversation]);
  const renderSectionHeader = useCallback(({ section }: { section: { title: string; data: Chat[] } }) => <View style={[styles.sectionHeading, { backgroundColor: colors.background }]}><Text style={[styles.sectionHeadingTitle, { color: colors.foreground }]}>{section.title}</Text><Text style={[styles.sectionHeadingCount, { color: colors.mutedForeground }]}>{section.data.length}</Text></View>, [colors]);
  const conversationKey = useCallback((item: Chat) => item.id, []);
   const selectedChat = (chats.data as Chat[] | undefined)?.find((item) => item.id === optionsId);
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={{ paddingTop: insets.top + 18 }}>
      <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>TEAM COMMUNICATION</Text><Text style={[styles.title, { color: colors.foreground }]}>Messages</Text></View><Pressable testID="new-chat" style={[styles.compose, { backgroundColor: colors.primary }]} onPress={() => router.push('/new-chat')}><Feather name="edit-3" size={18} color="#fff" /></Pressable></View>
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={17} color={colors.mutedForeground} /><TextInput testID="message-search" value={query} onChangeText={setQuery} placeholder="Search conversations" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View>
       <View style={styles.filters}>{['All', 'Direct'].map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, { backgroundColor: filter === item ? colors.foreground : colors.card, borderColor: colors.border }]}><Text style={[styles.filterText, { color: filter === item ? colors.background : colors.mutedForeground }]}>{item}</Text></Pressable>)}</View>
    </View>
       {muteError ? <Pressable onPress={() => setMuteError('')} accessibilityRole="alert"><Text style={[styles.muteError, { color: colors.destructive }]}>{muteError}</Text></Pressable> : null}
       {legacy.error ? <Pressable testID="retry-legacy-deletions" onPress={legacy.retry} accessibilityRole="button"><Text style={[styles.muteError, { color: colors.destructive }]}>{legacy.error} Tap to retry.</Text></Pressable> : null}
       {chats.isLoading || legacy.loading ? <ActivityIndicator style={{ marginTop: 50 }} color={colors.primary} /> : chats.isError ? <State title="Unable to load conversations" copy="Check your connection and try again." colors={colors} onRetry={() => void chats.refetch()} /> : <SectionList sections={sections} keyExtractor={conversationKey} renderItem={renderConversation} renderSectionHeader={renderSectionHeader} stickySectionHeadersEnabled={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30, paddingTop: 10, flexGrow: 1 }} removeClippedSubviews={Platform.OS === 'android'} initialNumToRender={10} maxToRenderPerBatch={8} windowSize={7} updateCellsBatchingPeriod={50} ListEmptyComponent={<State title="No conversations yet" copy="Start a private direct message with an active LPA member." colors={colors} />} />}
       <Modal visible={Boolean((optionsId && selectedChat) || deleteTarget)} transparent animationType="slide" onRequestClose={() => { if (deleteTarget) { if (!deleteChat.isPending) setDeleteTarget(null); } else setOptionsId(null); }}>
         {deleteTarget ? <ChatDeletionConfirmation embedded kind="conversation" visible pending={deleteChat.isPending} error={deleteError} onConfirm={deleteConversation} onCancel={() => setDeleteTarget(null)} /> : <View style={styles.optionsOverlay}>
           <Pressable style={StyleSheet.absoluteFill} onPress={() => setOptionsId(null)} accessibilityLabel="Close chat options" />
           <View style={[styles.optionsSheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
             <Text style={[styles.optionsTitle, { color: colors.foreground }]}>{selectedChat?.name}</Text>
              {selectedChat?.type === 'group' ? ([
                ['unmuted', 'Unmuted', 'bell'],
                ['all', 'Mute all', 'bell-off'],
                ['mentions', 'Mute except mentions', 'at-sign'],
              ] as [ChatMuteMode, string, 'bell' | 'bell-off' | 'at-sign'][]).map(([mode, label, icon]) =>
                <Pressable key={mode} testID={`mute-option-${mode}-${selectedChat.id}`} accessibilityRole="radio" accessibilityState={{ selected: getChatMuteMode(selectedChat) === mode, disabled: mutePending }} disabled={mutePending} onPress={() => { if (getChatMuteMode(selectedChat) !== mode) setMuteMode(selectedChat, mode, () => setMuteError('Could not update mute setting. Please try again.')); setOptionsId(null); }} style={styles.optionsAction}><Feather name={icon} size={19} color={colors.primary} /><Text style={[styles.optionsText, { color: colors.foreground, flex: 1 }]}>{label}</Text>{getChatMuteMode(selectedChat) === mode ? <Feather name="check" size={18} color={colors.primary} /> : null}</Pressable>) : null}
              <Pressable testID="delete-conversation-option" onPress={() => selectedChat && confirmHideConversation(selectedChat.id)} style={styles.optionsAction}><Feather name="trash-2" size={19} color={colors.destructive} /><Text style={[styles.optionsText, { color: colors.destructive }]}>Delete for me</Text></Pressable>
              <Pressable testID="close-chat-options" onPress={() => setOptionsId(null)} style={styles.optionsAction}><Text style={[styles.optionsText, { color: colors.mutedForeground }]}>Cancel</Text></Pressable>
           </View>
         </View>}
       </Modal>
  </View>;
}

const ConversationRow = React.memo(function ConversationRow({ item, colors, onOpen, onDelete, onOptions }: {
  item: Chat;
  colors: ReturnType<typeof useColors>;
  onOpen: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  onOptions: (conversationId: string) => void;
}) {
  const SwipeableRow = Platform.OS === 'web' ? Swipeable : ReanimatedSwipeable;
  return <SwipeableRow
    testID={`swipe-delete-conversation-${item.id}`}
    renderRightActions={() => <Pressable testID={`delete-for-me-conversation-${item.id}`} accessibilityRole="button" onPress={() => onDelete(item.id)} style={[styles.swipeAction, { backgroundColor: colors.destructive }]}><Feather name="trash-2" size={15} color="#fff" /><Text style={styles.swipeActionText}>Delete for me</Text></Pressable>}
    overshootRight={false}
    rightThreshold={80}
    friction={2}
    containerStyle={styles.swipeContainer}
  >
    <Pressable onPress={() => onOpen(item.id)} onLongPress={() => onOptions(item.id)} testID={`chat-row-${item.id}`} accessibilityLabel={`${item.name}${getChatMuteMode(item) === 'all' ? ', muted' : getChatMuteMode(item) === 'mentions' ? ', only mention notifications' : ''}`} style={({ pressed }) => [styles.conversation, { borderBottomColor: colors.border, backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.initials, { backgroundColor: `${colors.primary}20` }]}><Text style={[styles.initialsText, { color: colors.primary }]}>{item.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text></View>
      <View style={{ flex: 1 }}>
        <View style={styles.row}><Text style={[styles.sender, { color: colors.foreground }, item.unreadCount > 0 && styles.unreadText]}>{item.name}</Text><View style={styles.meta}><Text style={[styles.time, { color: colors.mutedForeground }]}>{item.type === 'direct' ? 'direct' : item.type}</Text>{item.isPinned ? <Feather name="bookmark" size={13} color={colors.primary} /> : null}{getChatMuteMode(item) === 'all' ? <Feather name="bell-off" size={13} color={colors.mutedForeground} /> : getChatMuteMode(item) === 'mentions' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Feather name="at-sign" size={13} color={colors.primary} /><Text style={[styles.time, { color: colors.primary }]}>mentions</Text></View> : null}{item.unreadCount > 0 ? <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}><Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View> : null}</View></View>
        <Text numberOfLines={1} style={[styles.preview, { color: item.unreadCount > 0 ? colors.foreground : colors.mutedForeground }, item.unreadCount > 0 && styles.unreadText]}>{visibleFormMessageText(item.lastMessage?.text ?? 'No messages yet')}</Text>
      </View>
      <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
    </Pressable>
  </SwipeableRow>;
});

function State({ title, copy, colors, onRetry }: { title: string; copy: string; colors: ReturnType<typeof useColors>; onRetry?: () => void }) {
  return <View style={styles.empty}><Feather name="message-square" size={28} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{copy}</Text>{onRetry ? <Pressable onPress={onRetry} style={[styles.retry, { borderColor: colors.border }]}><Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  optionsOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' }, optionsSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 22, paddingTop: 20 }, optionsTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginBottom: 13 }, optionsAction: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 13 }, optionsText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 }, muteError: { fontFamily: 'Inter_600SemiBold', fontSize: 12, paddingHorizontal: 20, paddingVertical: 8 }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 15, paddingBottom: 7 }, sectionHeadingTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 }, sectionHeadingCount: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  container: { flex: 1 }, header: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 }, title: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 5 }, compose: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }, search: { height: 43, marginHorizontal: 18, marginTop: 18, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }, searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13 }, filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, marginTop: 14, marginBottom: 2 }, filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16, borderWidth: 1 }, filterText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, swipeContainer: { borderRadius: 16, overflow: 'hidden' }, swipeAction: { width: 110, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }, swipeActionText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 10, textAlign: 'center' }, conversation: { minHeight: 76, paddingVertical: 15, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }, initials: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, initialsText: { fontFamily: 'Inter_700Bold', fontSize: 13 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }, meta: { flexDirection: 'row', alignItems: 'center', gap: 6 }, sender: { fontFamily: 'Inter_700Bold', fontSize: 13 }, time: { fontFamily: 'Inter_400Regular', fontSize: 10 }, preview: { fontFamily: 'Inter_400Regular', fontSize: 12, paddingRight: 4 }, unreadText: { fontFamily: 'Inter_700Bold' }, unreadBadge: { minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }, unreadBadgeText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 10 }, empty: { alignItems: 'center', paddingTop: 80, gap: 8, paddingHorizontal: 30 }, emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 6 }, emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' }, retry: { marginTop: 7, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 }, retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});