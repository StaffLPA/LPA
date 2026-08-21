import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { customFetch, useAddChatMember, useDeleteChat, useListChats, useListChatMessages, useListUsers, useMarkChatRead, useRemoveChatMember, useSendChatMessage } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';

function loadErrorMessage(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return 'You are not a member of this conversation.';
  return 'Messages could not load. Check your connection and try again.';
}

type MessageAttachment = { id: string; fileName: string; contentType: string; size: number };
type ChatMessage = { id: string; senderId: string; senderName: string; text: string; attachments?: MessageAttachment[] };
type SelectedAttachment = { uri: string; fileName: string; contentType: string; size: number; base64?: string | null };

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, role } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chats = useListChats({ query: { queryKey: ['chats'] } });
  const chat = (chats.data ?? []).find((item) => item.id === id);
  const messages = useListChatMessages(id ?? '', { query: { queryKey: ['chat-messages', id ?? ''] } });
  const people = useListUsers();
  const sendMessage = useSendChatMessage();
  const addMember = useAddChatMember();
  const removeMember = useRemoveChatMember();
  const deleteChat = useDeleteChat();
  const markChatRead = useMarkChatRead();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [showParticipants, setShowParticipants] = useState(false);
  const [actionError, setActionError] = useState('');
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<SelectedAttachment[]>([]);
  const lastReadMessageId = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const canManage = Boolean(chat && chat.type !== 'direct' && (role === 'Admin' || chat.createdBy === user?.id));
  const canDeleteChat = Boolean(chat && chat.type !== 'direct' && role === 'Admin');
  const availablePeople = useMemo(() => ((people.data ?? []) as { id: string; fullName: string; role: string; status: string }[]).filter((person) => person.status === 'active' && !chat?.members.some((member) => member.id === person.id)), [chat?.members, people.data]);
  const hiddenMessageSet = useMemo(() => new Set(hiddenMessageIds), [hiddenMessageIds]);
  const visibleMessages = useMemo(() => ((messages.data ?? []) as ChatMessage[]).filter((message) => !hiddenMessageSet.has(message.id)), [hiddenMessageSet, messages.data]);
  const hiddenMessagesKey = user?.id && id ? `lpa-hidden-chat-messages:${user.id}:${id}` : null;
  const latestMessageId = (messages.data as ChatMessage[] | undefined)?.at(-1)?.id;
  useEffect(() => {
    if (!id || !latestMessageId || lastReadMessageId.current === latestMessageId) return;
    lastReadMessageId.current = latestMessageId;
    markChatRead.mutate({ conversationId: id }, {
      onSuccess: () => queryClient.setQueryData(chats.queryKey, (current: unknown) => ((current ?? []) as Array<{ id: string; unreadCount: number }>).map((item) => item.id === id ? { ...item, unreadCount: 0 } : item)),
    });
  }, [chats.queryKey, id, latestMessageId, markChatRead, queryClient]);
  useEffect(() => {
    setHiddenMessageIds([]);
    if (!hiddenMessagesKey) return;
    let mounted = true;
    void AsyncStorage.getItem(hiddenMessagesKey).then((stored) => {
      if (!mounted || !stored) return;
      try {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) setHiddenMessageIds(parsed.filter((value): value is string => typeof value === 'string'));
      } catch {
        // Invalid local data should never block access to the server history.
      }
    });
    return () => { mounted = false; };
  }, [hiddenMessagesKey]);
  const refreshConversation = () => {
    void queryClient.invalidateQueries({ queryKey: chats.queryKey });
    void queryClient.invalidateQueries({ queryKey: messages.queryKey });
  };
  const addAttachment = async (kind: 'image' | 'file') => {
    try {
      const result = kind === 'image'
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true })
        : await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = kind === 'image' ? result.assets[0] : result.assets[0];
      if (!asset) return;
      const metadata = asset as { fileSize?: number; size?: number; fileName?: string; name?: string; mimeType?: string; base64?: string | null };
      const size = metadata.fileSize ?? metadata.size ?? 0;
      if (!size || size > 10 * 1024 * 1024) { setSendError('Attachments must be 10 MB or smaller.'); return; }
      setSelectedAttachments((current) => current.length >= 5 ? current : [...current, { uri: asset.uri, fileName: metadata.fileName ?? metadata.name ?? `attachment-${Date.now()}`, contentType: metadata.mimeType ?? (kind === 'image' ? 'image/jpeg' : 'application/octet-stream'), size, base64: metadata.base64 }]);
    } catch { setSendError('Could not select that attachment. Please try again.'); }
  };
  const chooseAttachment = () => Alert.alert('Add attachment', 'Choose what you want to send.', [{ text: 'Photo', onPress: () => void addAttachment('image') }, { text: 'File', onPress: () => void addAttachment('file') }, { text: 'Cancel', style: 'cancel' }]);
  const send = async () => {
    const text = draft.trim();
    if ((!text && !selectedAttachments.length) || !id || sendMessage.isPending || uploading) return;
    setSendError('');
    if (selectedAttachments.length) {
      setUploading(true);
      try {
        const attachments = await Promise.all(selectedAttachments.map(async (attachment) => {
          const upload = await customFetch<{ uploadURL: string; objectPath: string }>(`/api/chats/${id}/attachments/upload-url`, { method: 'POST', responseType: 'json', suppressUnauthorizedHandler: true, body: JSON.stringify({ fileName: attachment.fileName, contentType: attachment.contentType, size: attachment.size }) });
          const sourceUri = attachment.base64 ? `data:${attachment.contentType};base64,${attachment.base64}` : attachment.uri;
          const source = await fetch(sourceUri);
          const body = await source.blob();
          const put = await fetch(upload.uploadURL, { method: 'PUT', headers: { 'content-type': attachment.contentType }, body });
          if (!put.ok) throw new Error(`Upload failed (${put.status}). Please try again.`);
          return { ...upload, fileName: attachment.fileName, contentType: attachment.contentType, size: attachment.size };
        }));
        const created = await customFetch<ChatMessage>(`/api/chats/${id}/messages`, { method: 'POST', responseType: 'json', suppressUnauthorizedHandler: true, body: JSON.stringify({ text, attachments }) });
        queryClient.setQueryData(messages.queryKey, (current: unknown) => [...((current ?? []) as ChatMessage[]), created]);
        void queryClient.invalidateQueries({ queryKey: chats.queryKey });
        setDraft(''); setSelectedAttachments([]);
      } catch (error) { setSendError(error instanceof Error ? error.message : 'Attachments could not be sent. Please try again.'); } finally { setUploading(false); }
      return;
    }
    sendMessage.mutate({ conversationId: id, data: { text } }, {
      onSuccess: (created) => {
        queryClient.setQueryData(messages.queryKey, (current: typeof messages.data) => [...(current ?? []), created]);
        queryClient.invalidateQueries({ queryKey: chats.queryKey });
        setDraft('');
      },
      onError: (error) => setSendError(loadErrorMessage(error)),
    });
  };
  const hideMessageForMe = (messageId: string) => {
    setHiddenMessageIds((current) => {
      if (current.includes(messageId)) return current;
      const next = [...current, messageId];
      if (hiddenMessagesKey) void AsyncStorage.setItem(hiddenMessagesKey, JSON.stringify(next));
      return next;
    });
  };
  const confirmDeleteChat = () => Alert.alert('Delete conversation?', 'This will remove the channel or group chat and its history for everyone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => {
    if (!id) return;
    deleteChat.mutate({ conversationId: id }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: chats.queryKey });
        router.back();
      },
      onError: (error) => setActionError(loadErrorMessage(error)),
    });
  }}]);
  const confirmRemoveMember = (member: { id: string; fullName: string }) => Alert.alert('Remove participant?', `${member.fullName} will no longer be able to read or send messages in this conversation.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => {
    if (!id) return;
    removeMember.mutate({ conversationId: id, userId: member.id }, { onSuccess: refreshConversation, onError: (error) => setActionError(loadErrorMessage(error)) });
  }}]);
  const addParticipant = (userId: string) => {
    if (!id) return;
    addMember.mutate({ conversationId: id, data: { userId } }, { onSuccess: refreshConversation, onError: (error) => setActionError(loadErrorMessage(error)) });
  };
  return <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior="padding" keyboardVerticalOffset={0}>
    <View style={{ paddingTop: insets.top + 10 }}><View style={styles.header}><Pressable onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>{chat?.name ?? 'Conversation'}</Text><View style={styles.headerActions}>{canManage ? <Pressable testID="manage-participants" onPress={() => setShowParticipants((visible) => !visible)}><Feather name="users" size={21} color={colors.primary} /></Pressable> : null}{canDeleteChat ? <Pressable testID="delete-chat" disabled={deleteChat.isPending} onPress={confirmDeleteChat}><Feather name="trash-2" size={20} color={colors.destructive} /></Pressable> : null}{!canManage && !canDeleteChat ? <View style={{ width: 22 }} /> : null}</View></View></View>
    {showParticipants && chat ? <View style={[styles.participantPanel, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.participantHeading}><Text style={[styles.participantTitle, { color: colors.foreground }]}>Participants · {chat.members.length}</Text><Pressable onPress={() => setShowParticipants(false)}><Feather name="x" size={17} color={colors.mutedForeground} /></Pressable></View>{chat.members.map((member) => <View key={member.id} style={styles.participantRow}><Text style={[styles.participantName, { color: colors.foreground }]}>{member.fullName}</Text>{canManage && member.id !== chat.createdBy ? <Pressable testID={`remove-member-${member.id}`} onPress={() => confirmRemoveMember(member)}><Text style={[styles.removeText, { color: colors.destructive }]}>Remove</Text></Pressable> : null}</View>)}<Text style={[styles.addLabel, { color: colors.mutedForeground }]}>ADD PARTICIPANT</Text>{availablePeople.map((person) => <View key={person.id} style={styles.participantRow}><Text style={[styles.participantName, { color: colors.foreground }]}>{person.fullName}</Text><Pressable testID={`add-member-${person.id}`} disabled={addMember.isPending} onPress={() => addParticipant(person.id)}><Text style={[styles.addText, { color: colors.primary }]}>{addMember.isPending ? 'Adding…' : 'Add'}</Text></Pressable></View>)}</View> : null}
    {messages.isLoading ? <ActivityIndicator style={{ marginTop: 50 }} color={colors.primary} /> : messages.isError ? <View style={styles.center}><Text style={[styles.error, { color: colors.foreground }]}>Unable to load messages.</Text><Text style={{ color: colors.mutedForeground }}>{loadErrorMessage(messages.error)}</Text><Pressable onPress={() => void messages.refetch()} style={[styles.retry, { borderColor: colors.border }]}><Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text></Pressable></View> : <FlatList data={[...visibleMessages].reverse()} inverted keyExtractor={(item) => item.id} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 9 }} renderItem={({ item }) => <SwipeableMessage item={item} mine={item.senderId === user?.id} colors={colors} conversationId={id} onHide={() => hideMessageForMe(item.id)} />} ListEmptyComponent={<View style={styles.center}><Text style={[styles.error, { color: colors.foreground }]}>No messages yet</Text><Text style={{ color: colors.mutedForeground }}>Start the conversation.</Text></View>} />}
      <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) }]}>{selectedAttachments.length ? <View style={styles.attachmentQueue}>{selectedAttachments.map((attachment, index) => <Pressable key={`${attachment.uri}-${index}`} onPress={() => setSelectedAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={[styles.queuedAttachment, { backgroundColor: `${colors.primary}18` }]}><Feather name={attachment.contentType.startsWith('image/') ? 'image' : 'paperclip'} size={13} color={colors.primary} /><Text numberOfLines={1} style={[styles.queuedAttachmentText, { color: colors.primary }]}>{attachment.fileName}</Text><Feather name="x" size={13} color={colors.primary} /></Pressable>)}</View> : null}<View style={styles.composerRow}><Pressable testID="add-attachment" onPress={chooseAttachment} disabled={uploading} style={[styles.attach, { borderColor: colors.border }]}><Feather name="paperclip" size={18} color={colors.primary} /></Pressable><TextInput testID="message-composer" value={draft} onChangeText={setDraft} placeholder="Write a message..." placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} onSubmitEditing={() => void send()} returnKeyType="send" /><Pressable testID="send-message" onPress={() => void send()} disabled={sendMessage.isPending || uploading || (!draft.trim() && !selectedAttachments.length)} style={[styles.send, { backgroundColor: (draft.trim() || selectedAttachments.length) && !sendMessage.isPending && !uploading ? colors.primary : colors.muted }]}><Feather name={sendMessage.isPending || uploading ? 'clock' : 'arrow-up'} size={18} color="#fff" /></Pressable></View></View>
     {visibleMessages.length ? <Text style={[styles.swipeHint, { color: colors.mutedForeground }]}>Swipe a message left to delete it for you</Text> : null}
    {sendError ? <Pressable testID="retry-message" onPress={send} style={styles.failure}><Text style={[styles.failureText, { color: colors.primary }]}>{sendError} Tap to retry.</Text></Pressable> : null}
    {actionError ? <Pressable onPress={() => setActionError('')} style={styles.actionFailure}><Text style={[styles.failureText, { color: colors.primary }]}>{actionError} Tap to dismiss.</Text></Pressable> : null}
  </KeyboardAvoidingView>;
}

function SwipeableMessage({ item, mine, colors, onHide, conversationId }: {
  item: ChatMessage;
  mine: boolean;
  colors: ReturnType<typeof useColors>;
  onHide: () => void;
  conversationId: string;
}) {
  const confirmHide = () => Alert.alert('Delete for me?', 'This message will be removed only from your view. Other participants will still see it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', style: 'destructive', onPress: onHide }]);
  return <Swipeable
    testID={`swipe-delete-message-${item.id}`}
    renderRightActions={() => <Pressable testID={`delete-for-me-message-${item.id}`} accessibilityRole="button" onPress={confirmHide} style={[styles.swipeAction, { backgroundColor: colors.destructive }]}><Feather name="trash-2" size={15} color="#fff" /><Text style={styles.swipeActionText}>Delete for me</Text></Pressable>}
    overshootRight={false}
    rightThreshold={80}
    friction={2}
    containerStyle={[styles.swipeContainer, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}
  >
    <View style={[styles.bubble, { backgroundColor: mine ? colors.primary : colors.card }]}><Text style={[styles.sender, { color: mine ? '#fff' : colors.mutedForeground }]}>{mine ? 'You' : item.senderName}</Text>{item.text ? <Text style={[styles.message, { color: mine ? '#fff' : colors.foreground }]}>{item.text}</Text> : null}{item.attachments?.map((attachment) => <AttachmentCard key={attachment.id} attachment={attachment} conversationId={conversationId} mine={mine} colors={colors} />)}</View>
  </Swipeable>;
}

function AttachmentCard({ attachment, conversationId, mine, colors }: { attachment: MessageAttachment; conversationId: string; mine: boolean; colors: ReturnType<typeof useColors> }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!attachment.id) return;
    void customFetch<{ url: string }>(`/api/chats/${conversationId}/attachments/${attachment.id}/access-url`, {
      responseType: 'json',
      suppressUnauthorizedHandler: true,
    }).then((value) => setUrl(value.url)).catch(() => undefined);
  }, [attachment.id, conversationId]);
  const foreground = mine ? '#fff' : colors.foreground;
  if (attachment.contentType.startsWith('image/')) return url ? <Pressable onPress={() => void Linking.openURL(url)}><Image source={{ uri: url }} accessibilityLabel={attachment.fileName} style={styles.attachmentImage} /></Pressable> : <Text style={[styles.attachmentLoading, { color: foreground }]}>Loading image…</Text>;
  return <Pressable onPress={() => url ? void Linking.openURL(url) : undefined} style={[styles.fileAttachment, { borderColor: mine ? '#ffffff66' : colors.border }]}><Feather name="file-text" size={17} color={foreground} /><Text numberOfLines={1} style={[styles.fileAttachmentName, { color: foreground }]}>{attachment.fileName}</Text><Feather name="download" size={15} color={foreground} /></Pressable>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { height: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }, headerActions: { minWidth: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 13 }, title: { flex: 1, textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 17 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7 }, error: { fontFamily: 'Inter_700Bold', fontSize: 15 }, retry: { marginTop: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }, retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, participantPanel: { marginHorizontal: 16, marginTop: 3, borderWidth: 1, borderRadius: 15, padding: 12, gap: 8 }, participantHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, participantTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 }, participantRow: { minHeight: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, participantName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 }, removeText: { fontFamily: 'Inter_700Bold', fontSize: 11 }, addLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1, marginTop: 5 }, addText: { fontFamily: 'Inter_700Bold', fontSize: 11 }, swipeContainer: { maxWidth: '92%', borderRadius: 16 }, swipeAction: { width: 110, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, borderRadius: 16 }, swipeActionText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 10, textAlign: 'center' }, bubble: { maxWidth: '100%', borderRadius: 16, padding: 11 }, sender: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginBottom: 4 }, message: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 }, swipeHint: { fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'center', paddingVertical: 5 }, composer: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 10 }, composerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, attach: { width: 38, height: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, height: 42, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 13 }, send: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }, attachmentQueue: { gap: 5, marginBottom: 8 }, queuedAttachment: { height: 30, borderRadius: 9, paddingHorizontal: 9, flexDirection: 'row', gap: 6, alignItems: 'center' }, queuedAttachmentText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11 }, attachmentImage: { width: 210, height: 150, borderRadius: 10, marginTop: 7, backgroundColor: '#00000018' }, attachmentLoading: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7 }, fileAttachment: { borderWidth: 1, borderRadius: 10, marginTop: 7, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: 240 }, fileAttachmentName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11 }, failure: { position: 'absolute', bottom: 70, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 8 }, actionFailure: { position: 'absolute', top: 65, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 8 }, failureText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'center' },
});