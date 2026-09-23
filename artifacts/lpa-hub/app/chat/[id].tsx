import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { customFetch, useAddChatMember, useAddChatMessageReaction, useCreateChat, useDeleteChat, useDeleteChatMessage, useEditChatMessage, useListChats, useListChatMessages, useListUsers, useMarkChatRead, useRemoveChatMember, useRemoveChatMessageReaction, useSendChatMessage, type MessageReaction } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { MessagePhotoViewer } from '@/components/MessagePhotoViewer';
import { MessageReactions } from '@/components/MessageReactions';
import { useChatMute } from '@/lib/useChatMute';
import { useTagCatalog } from '@/hooks/useTagCatalog';
import { tagLabel } from '@/constants/tagCatalog';
import { LPA_TEAMS, teamEventAliases } from '@/constants/teams';

function loadErrorMessage(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return 'You are not a member of this conversation.';
  return 'Messages could not load. Check your connection and try again.';
}

type MessageAttachment = { id: string; fileName: string; contentType: string; size: number };
type MessageMention = { userId: string; displayName: string; start: number; end: number };
type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderProfilePhotoUri: string | null;
  text: string;
  attachments?: MessageAttachment[];
  reactions: MessageReaction[];
  replyTo: { id: string; senderId: string; senderName: string; text: string } | null;
  mentions: MessageMention[];
  edited: boolean;
  editedAt: string | null;
  deletedForEveryone: boolean;
  deletedAt: string | null;
  createdAt: string;
};
type SelectedAttachment = { uri: string; fileName: string; contentType: string; size: number; base64?: string | null; file?: Blob };
type DirectoryPerson = { id: string; fullName: string; role: string; roleTag?: string | null; status: string; teams: string[]; profilePhotoUri?: string | null };
type SelectedProfile = Pick<DirectoryPerson, 'id' | 'fullName' | 'role' | 'roleTag' | 'teams' | 'profilePhotoUri'>;

function reconcileMentions(previousText: string, nextText: string, mentions: MessageMention[]) {
  if (!mentions.length || previousText === nextText) return mentions;
  let prefixLength = 0;
  while (prefixLength < previousText.length && prefixLength < nextText.length && previousText[prefixLength] === nextText[prefixLength]) prefixLength += 1;
  let previousSuffix = previousText.length;
  let nextSuffix = nextText.length;
  while (previousSuffix > prefixLength && nextSuffix > prefixLength && previousText[previousSuffix - 1] === nextText[nextSuffix - 1]) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }
  const delta = nextText.length - previousText.length;
  return mentions.flatMap((mention) => {
    const token = `@${mention.displayName}`;
    if (mention.end <= prefixLength && nextText.slice(mention.start, mention.end) === token) return [mention];
    if (mention.start >= previousSuffix) {
      const shifted = { ...mention, start: mention.start + delta, end: mention.end + delta };
      return nextText.slice(shifted.start, shifted.end) === token ? [shifted] : [];
    }
    return [];
  });
}

function normalizeOutgoingMessage(text: string, mentions: MessageMention[]) {
  const startOffset = text.length - text.trimStart().length;
  const normalizedText = text.trim();
  return {
    text: normalizedText,
    mentions: mentions.flatMap((mention) => {
      const shifted = { ...mention, start: mention.start - startOffset, end: mention.end - startOffset };
      return shifted.start >= 0 && shifted.end <= normalizedText.length
        && normalizedText.slice(shifted.start, shifted.end) === `@${shifted.displayName}` ? [shifted] : [];
    }),
  };
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, role } = useApp();
  const catalogQuery = useTagCatalog();
  const catalog = catalogQuery.data;
  const { id } = useLocalSearchParams<{ id: string }>();
  const chats = useListChats({ query: { queryKey: ['chats'] } });
  const chat = (chats.data ?? []).find((item) => item.id === id);
  const { toggleMute, isPending: mutePending } = useChatMute();
  const messages = useListChatMessages(id ?? '', { query: { queryKey: ['chat-messages', id ?? ''], refetchInterval: 10_000 } });
  useEffect(() => {
    if (!id || !user?.id) return;
    let stopped = false;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let finishRetry: (() => void) | undefined;
    const listen = async () => {
      while (!stopped) {
        try {
          const result = await customFetch<{ updated: boolean }>(`/api/chats/${encodeURIComponent(id)}/messages/updates`, {
            signal: controller.signal,
            responseType: 'json',
            suppressUnauthorizedHandler: true,
          });
          if (!stopped && result.updated) {
            void queryClient.invalidateQueries({ queryKey: ['chat-messages', id] });
            void queryClient.invalidateQueries({ queryKey: ['chats'] });
          }
        } catch (error) {
          if (stopped) break;
          const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
          if (status === 401 || status === 403) break;
          await new Promise<void>((resolve) => {
            finishRetry = resolve;
            retryTimer = setTimeout(resolve, 3000);
          });
          finishRetry = undefined;
        }
      }
    };
    void listen();
    return () => {
      stopped = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      finishRetry?.();
    };
  }, [id, user?.id, queryClient]);
  const people = useListUsers();
  const createChat = useCreateChat();
  const sendMessage = useSendChatMessage();
  const editMessage = useEditChatMessage();
  const deleteMessage = useDeleteChatMessage();
  const addMember = useAddChatMember();
  const removeMember = useRemoveChatMember();
  const deleteChat = useDeleteChat();
  const markChatRead = useMarkChatRead();
  const addReaction = useAddChatMessageReaction();
  const removeReaction = useRemoveChatMessageReaction();
  const [draft, setDraft] = useState('');
  const [draftMentions, setDraftMentions] = useState<MessageMention[]>([]);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [sendError, setSendError] = useState('');
  const [showParticipants, setShowParticipants] = useState(false);
  const [participantQuery, setParticipantQuery] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<SelectedAttachment[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleteClock, setDeleteClock] = useState(Date.now());
  const [deleteToast, setDeleteToast] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<SelectedProfile | null>(null);
  const lastReadMessageId = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const canManage = Boolean(chat && chat.type !== 'direct' && (role === 'Admin' || chat.createdBy === user?.id));
  const canDeleteChat = Boolean(chat && chat.type !== 'direct' && role === 'Admin');
  const availablePeople = useMemo(() => ((people.data ?? []) as DirectoryPerson[]).filter((person) => person.status === 'active' && !chat?.members.some((member) => member.id === person.id)), [chat?.members, people.data]);
  const filteredAvailablePeople = useMemo(() => {
    const search = participantQuery.trim().toLocaleLowerCase();
    return availablePeople.filter((person) => !search || [
      person.fullName, person.role, tagLabel(catalog, 'role', person.role),
      ...person.teams.flatMap((team) => [team, tagLabel(catalog, 'team', team)]),
    ].some((value) => value.toLocaleLowerCase().includes(search)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [availablePeople, participantQuery, catalog]);
  const conversationPeople = useMemo(() => (chat?.members ?? []).map((member) => {
    const directoryPerson = (people.data as DirectoryPerson[] | undefined)?.find((person) => person.id === member.id);
    return { ...member, role: directoryPerson?.role ?? member.role, roleTag: directoryPerson?.roleTag ?? (member as typeof member & { roleTag?: string }).roleTag, status: directoryPerson?.status ?? 'active', teams: directoryPerson?.teams ?? [], profilePhotoUri: directoryPerson?.profilePhotoUri };
  }), [chat?.members, people.data]);
  const sortedConversationPeople = useMemo(() => [...conversationPeople].sort((a, b) => {
    const aPinned = a.role === 'Admin' || a.role === 'Staff-Coach';
    const bPinned = b.role === 'Admin' || b.role === 'Staff-Coach';
    return Number(bPinned) - Number(aPinned) || a.fullName.localeCompare(b.fullName);
  }), [conversationPeople]);
  const activeMention = useMemo(() => {
    if (selection.start !== selection.end) return null;
    const beforeCursor = draft.slice(0, selection.start);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) return null;
    const start = selection.start - match[1].length - 1;
    if (draftMentions.some((mention) => start >= mention.start && start < mention.end)) return null;
    return { start, end: selection.start, prefix: match[1].toLocaleLowerCase() };
  }, [draft, draftMentions, selection]);
  const mentionSuggestions = useMemo(() => {
    if (!activeMention) return [];
    return conversationPeople.filter((person) => person.id !== user?.id && person.fullName.trim().split(/\s+/).some((name) => name.toLocaleLowerCase().startsWith(activeMention.prefix))).slice(0, 8);
  }, [activeMention, conversationPeople, user?.id]);
  const openProfile = (message: ChatMessage) => {
    if (message.senderId === user?.id) return;
    const directoryPerson = (people.data as DirectoryPerson[] | undefined)?.find((person) => person.id === message.senderId);
    const conversationMember = chat?.members.find((member) => member.id === message.senderId);
    setSelectedProfile({
      id: message.senderId,
      fullName: directoryPerson?.fullName ?? message.senderName,
      role: directoryPerson?.role ?? conversationMember?.role ?? '',
      roleTag: directoryPerson?.roleTag ?? (conversationMember as typeof conversationMember & { roleTag?: string } | undefined)?.roleTag,
      teams: directoryPerson?.teams ?? [],
      profilePhotoUri: directoryPerson?.profilePhotoUri ?? message.senderProfilePhotoUri,
    });
  };
  const openMentionProfile = (userId: string, displayName: string) => {
    const directoryPerson = conversationPeople.find((person) => person.id === userId);
    setSelectedProfile({
      id: userId,
      fullName: directoryPerson?.fullName ?? displayName,
      role: directoryPerson?.role ?? '',
      roleTag: directoryPerson?.roleTag,
      teams: directoryPerson?.teams ?? [],
      profilePhotoUri: directoryPerson?.profilePhotoUri,
    });
  };
  const closeProfile = () => {
    if (createChat.isPending) return;
    setSelectedProfile(null);
    createChat.reset();
  };
  const messageProfile = () => {
    if (!selectedProfile || createChat.isPending) return;
    createChat.mutate({ data: { type: 'direct', userIds: [selectedProfile.id] } }, {
      onSuccess: (conversation) => {
        setSelectedProfile(null);
        void queryClient.invalidateQueries({ queryKey: chats.queryKey });
        router.push(`/chat/${conversation.id}` as never);
      },
    });
  };
  const visibleMessages = (messages.data ?? []) as ChatMessage[];
  useEffect(() => {
    if (!deleteTarget) return;
    setDeleteClock(Date.now());
    const timer = setInterval(() => setDeleteClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deleteTarget]);
  useEffect(() => {
    if (!deleteToast) return;
    const timer = setTimeout(() => setDeleteToast(''), 4500);
    return () => clearTimeout(timer);
  }, [deleteToast]);
  const canDeleteForEveryone = Boolean(deleteTarget && deleteTarget.senderId === user?.id
    && !deleteTarget.deletedForEveryone
    && deleteClock - new Date(deleteTarget.createdAt).getTime() < 15 * 60_000);
  const latestMessageId = (messages.data as ChatMessage[] | undefined)?.at(-1)?.id;
  useEffect(() => {
    if (!id || !latestMessageId || lastReadMessageId.current === latestMessageId) return;
    lastReadMessageId.current = latestMessageId;
    markChatRead.mutate({ conversationId: id }, {
      onSuccess: () => queryClient.setQueryData(chats.queryKey, (current: unknown) => ((current ?? []) as Array<{ id: string; unreadCount: number }>).map((item) => item.id === id ? { ...item, unreadCount: 0 } : item)),
    });
  }, [chats.queryKey, id, latestMessageId, markChatRead, queryClient]);
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
      const metadata = asset as { fileSize?: number; size?: number; fileName?: string; name?: string; mimeType?: string; base64?: string | null; file?: Blob };
      const size = metadata.fileSize ?? metadata.size ?? metadata.file?.size ?? 0;
      if (!size || size > 10 * 1024 * 1024) { setSendError('Attachments must be 10 MB or smaller.'); return; }
      setSelectedAttachments((current) => current.length >= 5 ? current : [...current, { uri: asset.uri, fileName: metadata.fileName ?? metadata.name ?? `attachment-${Date.now()}`, contentType: metadata.mimeType ?? (kind === 'image' ? 'image/jpeg' : 'application/octet-stream'), size, base64: metadata.base64, file: metadata.file }]);
    } catch { setSendError('Could not select that attachment. Please try again.'); }
  };
  const chooseAttachment = () => {
    if (Platform.OS === 'web') {
      void addAttachment('file');
      return;
    }
    Alert.alert('Add attachment', 'Choose what you want to send.', [{ text: 'Photo', onPress: () => void addAttachment('image') }, { text: 'File', onPress: () => void addAttachment('file') }, { text: 'Cancel', style: 'cancel' }]);
  };
  const send = async () => {
    const { text, mentions } = normalizeOutgoingMessage(draft, draftMentions);
    if (editingMessage) {
      if (!text || !id || editMessage.isPending) return;
      setSendError('');
      editMessage.mutate({ conversationId: id, messageId: editingMessage.id, data: { text, mentions } }, {
        onSuccess: (updated) => {
          queryClient.setQueryData(messages.queryKey, (current: unknown) => ((current ?? []) as ChatMessage[]).map((message) => message.id === updated.id ? updated : message));
          void queryClient.invalidateQueries({ queryKey: chats.queryKey });
          setDraft('');
          setDraftMentions([]);
          setSelection({ start: 0, end: 0 });
          setEditingMessage(null);
        },
        onError: (error) => setSendError(loadErrorMessage(error)),
      });
      return;
    }
    if ((!text && !selectedAttachments.length) || !id || sendMessage.isPending || uploading) return;
    setSendError('');
    if (selectedAttachments.length) {
      setUploading(true);
      try {
        const attachments = await Promise.all(selectedAttachments.map(async (attachment) => {
          const sourceUri = attachment.base64 ? `data:${attachment.contentType};base64,${attachment.base64}` : attachment.uri;
          const body = attachment.file ?? await (await fetch(sourceUri)).blob();
          if (Platform.OS === 'web') {
            const upload = await customFetch<{ objectPath: string }>(`/api/chats/${id}/attachments/upload?fileName=${encodeURIComponent(attachment.fileName)}`, {
              method: 'POST',
              responseType: 'json',
              suppressUnauthorizedHandler: true,
              headers: { 'content-type': attachment.contentType },
              body,
            });
            return { ...upload, fileName: attachment.fileName, contentType: attachment.contentType, size: attachment.size };
          }
          const upload = await customFetch<{ uploadURL: string; objectPath: string }>(`/api/chats/${id}/attachments/upload-url`, { method: 'POST', responseType: 'json', suppressUnauthorizedHandler: true, body: JSON.stringify({ fileName: attachment.fileName, contentType: attachment.contentType, size: attachment.size }) });
          const put = await fetch(upload.uploadURL, { method: 'PUT', headers: { 'content-type': attachment.contentType }, body });
          if (!put.ok) throw new Error(`Upload failed (${put.status}). Please try again.`);
          return { ...upload, fileName: attachment.fileName, contentType: attachment.contentType, size: attachment.size };
        }));
        const created = await customFetch<ChatMessage>(`/api/chats/${id}/messages`, { method: 'POST', responseType: 'json', suppressUnauthorizedHandler: true, body: JSON.stringify({ text, attachments, replyToMessageId: replyingTo?.id, mentions }) });
        queryClient.setQueryData(messages.queryKey, (current: unknown) => [...((current ?? []) as ChatMessage[]), created]);
        void queryClient.invalidateQueries({ queryKey: chats.queryKey });
        setDraft(''); setDraftMentions([]); setSelection({ start: 0, end: 0 }); setSelectedAttachments([]); setReplyingTo(null);
      } catch (error) { setSendError(error instanceof Error ? error.message : 'Attachments could not be sent. Please try again.'); } finally { setUploading(false); }
      return;
    }
    sendMessage.mutate({ conversationId: id, data: { text, replyToMessageId: replyingTo?.id, mentions } }, {
      onSuccess: (created) => {
        queryClient.setQueryData(messages.queryKey, (current: typeof messages.data) => [...(current ?? []), created]);
        queryClient.invalidateQueries({ queryKey: chats.queryKey });
        setDraft('');
        setDraftMentions([]);
        setSelection({ start: 0, end: 0 });
        setReplyingTo(null);
      },
      onError: (error) => setSendError(loadErrorMessage(error)),
    });
  };
  const updateDraft = (nextDraft: string) => {
    setDraftMentions((current) => reconcileMentions(draft, nextDraft, current));
    setDraft(nextDraft);
  };
  const updateSelection = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => setSelection(event.nativeEvent.selection);
  const insertMention = (person: { id: string; fullName: string }) => {
    if (!activeMention) return;
    const token = `@${person.fullName}`;
    const suffix = draft.slice(activeMention.end);
    const separator = suffix.startsWith(' ') ? '' : ' ';
    const nextDraft = `${draft.slice(0, activeMention.start)}${token}${separator}${suffix}`;
    const end = activeMention.start + token.length;
    setDraft(nextDraft);
    setDraftMentions((current) => [...current.filter((mention) => mention.end <= activeMention.start || mention.start >= activeMention.end), { userId: person.id, displayName: person.fullName, start: activeMention.start, end }].sort((a, b) => a.start - b.start));
    setSelection({ start: end + separator.length, end: end + separator.length });
  };
  const beginEdit = (message: ChatMessage) => {
    setEditingMessage(message);
    setReplyingTo(null);
    setSelectedAttachments([]);
    setDraft(message.text);
    setDraftMentions(message.mentions ?? []);
    setSelection({ start: message.text.length, end: message.text.length });
    setSendError('');
  };
  const cancelEdit = () => {
    setEditingMessage(null);
    setDraft('');
    setDraftMentions([]);
    setSelection({ start: 0, end: 0 });
    setSendError('');
  };
  const removeMessage = async (message: ChatMessage, scope: 'me' | 'everyone') => {
    if (!id || deleteMessage.isPending) return;
    setDeleteTarget(null);
    setDeleteToast('');
    await queryClient.cancelQueries({ queryKey: messages.queryKey });
    const previous = queryClient.getQueryData<ChatMessage[]>(messages.queryKey) ?? [];
    const index = previous.findIndex((item) => item.id === message.id);
    queryClient.setQueryData<ChatMessage[]>(messages.queryKey, (current = []) =>
      scope === 'me' ? current.filter((item) => item.id !== message.id)
        : current.map((item) => item.id === message.id ? {
          ...item, text: '', mentions: [], attachments: [], reactions: [], replyTo: null,
          deletedForEveryone: true, deletedAt: new Date().toISOString(),
        } : item));
    deleteMessage.mutate({ conversationId: id, messageId: message.id, data: { scope } }, {
      onSuccess: () => {
        if (editingMessage?.id === message.id) cancelEdit();
        refreshConversation();
      },
      onError: (error) => {
        if (index >= 0) queryClient.setQueryData<ChatMessage[]>(messages.queryKey, (current = []) =>
          scope === 'me'
            ? current.some((item) => item.id === message.id) ? current : [
              ...current.slice(0, Math.min(index, current.length)), previous[index], ...current.slice(Math.min(index, current.length)),
            ]
            : current.map((item) => item.id === message.id ? previous[index] : item));
        const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
        setDeleteToast(status === 409 && scope === 'everyone'
          ? 'The 15-minute window has passed. Your message was not deleted for everyone.'
          : `Message not deleted. ${loadErrorMessage(error)}`);
        void queryClient.invalidateQueries({ queryKey: messages.queryKey });
      },
    });
  };
  const deleteConversation = () => {
    if (!id) return;
    deleteChat.mutate({ conversationId: id }, {
      onSuccess: () => {
        queryClient.setQueryData(chats.queryKey, (current: unknown) => ((current ?? []) as Array<{ id: string }>).filter((item) => item.id !== id));
        router.back();
      },
      onError: (error) => setActionError(loadErrorMessage(error)),
    });
  };
  const confirmDeleteChat = () => {
    const title = 'Delete conversation?';
    const message = 'This will remove the channel or group chat and its history for everyone.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) deleteConversation();
      return;
    }
    Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: deleteConversation }]);
  };
  const removeParticipant = (member: { id: string; fullName: string }) => {
    if (!id) return;
    removeMember.mutate({ conversationId: id, userId: member.id }, {
      onSuccess: () => {
        queryClient.setQueryData(chats.queryKey, (current: unknown) => ((current ?? []) as Array<{ id: string; members: Array<{ id: string }> }>).map((item) => item.id === id ? { ...item, members: item.members.filter((person) => person.id !== member.id) } : item));
        void queryClient.invalidateQueries({ queryKey: messages.queryKey });
      },
      onError: (error) => setActionError(loadErrorMessage(error)),
    });
  };
  const confirmRemoveMember = (member: { id: string; fullName: string }) => {
    const title = 'Remove participant?';
    const message = `${member.fullName} will no longer be able to read or send messages in this conversation.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) removeParticipant(member);
      return;
    }
    Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeParticipant(member) }]);
  };
  const addParticipant = (userId: string) => {
    if (!id) return;
    addMember.mutate({ conversationId: id, data: { userId } }, { onSuccess: refreshConversation, onError: (error) => setActionError(loadErrorMessage(error)) });
  };
  const updateReaction = (messageId: string, emoji: MessageReaction['emoji'], reacted: boolean) => {
    if (!id) return;
    const mutation = reacted ? removeReaction : addReaction;
    mutation.mutate({ conversationId: id, messageId, data: { emoji } }, {
      onSuccess: (nextReaction) => {
        queryClient.setQueryData(messages.queryKey, (current: unknown) => ((current ?? []) as ChatMessage[]).map((message) => {
          if (message.id !== messageId) return message;
          const reactions = message.reactions.filter((reaction) => reaction.emoji !== nextReaction.emoji);
          return nextReaction.count > 0 ? { ...message, reactions: [...reactions, nextReaction] } : { ...message, reactions };
        }));
        void queryClient.invalidateQueries({ queryKey: messages.queryKey });
      },
      onError: (error) => setActionError(loadErrorMessage(error)),
    });
  };
  return <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior="padding" keyboardVerticalOffset={0}>
    <View style={{ paddingTop: insets.top + 10 }}><View style={styles.header}><Pressable onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>{chat?.name ?? 'Conversation'}</Text><View style={styles.headerActions}>{chat?.type === 'group' || canManage ? <Pressable testID="manage-participants" accessibilityLabel="Group chat info" onPress={() => setShowParticipants((visible) => !visible)}><Feather name="users" size={21} color={colors.primary} /></Pressable> : null}{canDeleteChat ? <Pressable testID="delete-chat" disabled={deleteChat.isPending} onPress={confirmDeleteChat}><Feather name="trash-2" size={20} color={colors.destructive} /></Pressable> : null}{!canManage && chat?.type !== 'group' && !canDeleteChat ? <View style={{ width: 22 }} /> : null}</View></View></View>
    {showParticipants && chat ? <View style={[styles.participantPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.participantHeading}>
        {chat.type !== 'group' ? <Text style={[styles.participantTitle, { color: colors.foreground }]}>Participants · {chat.members.length}</Text> : null}
        <Pressable onPress={() => setShowParticipants(false)} accessibilityLabel="Close group info" style={{ marginLeft: 'auto' }}><Feather name="x" size={17} color={colors.mutedForeground} /></Pressable>
      </View>
      {chat.type === 'group' ? <View style={styles.participantRow}>
        <View style={{ flex: 1 }}><Text style={[styles.participantName, { color: colors.foreground }]}>Mute notifications</Text><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Messages will still appear in this chat.</Text></View>
        <Switch testID="group-mute-toggle" accessibilityLabel="Mute group notifications" value={chat.isMuted} disabled={mutePending} onValueChange={() => toggleMute(chat, () => setActionError('Could not update mute setting. Please try again.'))} trackColor={{ true: colors.primary }} />
       </View> : null}
       <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 10 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {chat.type === 'group' ? <Text style={[styles.addLabel, { color: colors.primary, fontSize: 13 }]}>Members</Text> : null}
        {sortedConversationPeople.map((member) => <View key={member.id} style={styles.participantRow}>
          <Pressable testID={`group-member-${member.id}`} accessibilityRole="button" accessibilityLabel={`View ${member.fullName}'s profile`} onPress={() => openMentionProfile(member.id, member.fullName)} style={{ flex: 1, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.mentionAvatar, { width: 36, height: 36, borderRadius: 18, backgroundColor: `${colors.primary}20` }]}>
              {member.profilePhotoUri ? <Image source={{ uri: member.profilePhotoUri }} accessibilityLabel={`${member.fullName} profile picture`} resizeMode="cover" style={[styles.mentionAvatarImage, { width: 36, height: 36 }]} /> : <Text style={[styles.mentionAvatarText, { color: colors.primary }]}>{member.fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.participantName, { color: colors.foreground }]}>{member.fullName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
                <View style={[memberTagStyles.tag, { backgroundColor: colors.secondary }]}><Text style={[memberTagStyles.text, { color: colors.primary }]}>{roleLabel(member.roleTag ?? member.role)}</Text></View>
                {[...new Set(member.teams.map((team) => tagLabel(catalog, 'team', team)))].map((team) => <View key={team} style={[memberTagStyles.tag, { backgroundColor: colors.secondary }]}><Text style={[memberTagStyles.text, { color: colors.primary }]}>{team}</Text></View>)}
              </View>
            </View>
          </Pressable>
          {canManage && member.id !== chat.createdBy ? <Pressable testID={`remove-member-${member.id}`} onPress={() => confirmRemoveMember(member)}><Text style={[styles.removeText, { color: colors.destructive }]}>Remove</Text></Pressable> : null}
        </View>)}
        {canManage ? <>
          <Text style={[styles.addLabel, { color: colors.primary, fontSize: 13 }]}>ADD PARTICIPANT</Text>
          <View style={[memberTagStyles.search, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Feather name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              testID="add-participant-search"
              accessibilityLabel="Search people by name, role, or team"
              value={participantQuery}
              onChangeText={setParticipantQuery}
              placeholder="Search name, role, or team"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              style={[memberTagStyles.searchInput, { color: colors.foreground }]}
            />
            {participantQuery ? <Pressable onPress={() => setParticipantQuery('')} accessibilityLabel="Clear participant search" hitSlop={8}><Feather name="x" size={15} color={colors.mutedForeground} /></Pressable> : null}
          </View>
          {filteredAvailablePeople.map((person) => <View key={person.id} style={styles.participantRow}>
            <View style={memberTagStyles.person}>
              <View style={[styles.mentionAvatar, memberTagStyles.avatar, { backgroundColor: `${colors.primary}20` }]}>
                {person.profilePhotoUri ? <Image source={{ uri: person.profilePhotoUri }} accessibilityLabel={`${person.fullName} profile picture`} resizeMode="cover" style={memberTagStyles.avatarImage} /> : <Text style={[styles.mentionAvatarText, { color: colors.primary }]}>{person.fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.participantName, { color: colors.foreground }]}>{person.fullName}</Text>
                <View style={memberTagStyles.tags}>
                  <View style={[memberTagStyles.tag, { backgroundColor: colors.secondary }]}><Text style={[memberTagStyles.text, { color: colors.primary }]}>{roleLabel(person.roleTag ?? person.role)}</Text></View>
                  {[...new Set(person.teams.map((team) => tagLabel(catalog, 'team', team)))].map((team) => <View key={team} style={[memberTagStyles.tag, { backgroundColor: colors.secondary }]}><Text style={[memberTagStyles.text, { color: colors.primary }]}>{team}</Text></View>)}
                </View>
              </View>
            </View>
            <Pressable testID={`add-member-${person.id}`} accessibilityRole="button" accessibilityLabel={`Add ${person.fullName}`} disabled={addMember.isPending} onPress={() => addParticipant(person.id)} style={memberTagStyles.addAction}><Text style={[styles.addText, { color: colors.primary }]}>{addMember.isPending ? 'Adding…' : 'Add'}</Text></Pressable>
          </View>)}
          {!people.isLoading && !people.isError && filteredAvailablePeople.length === 0 ? <Text style={[memberTagStyles.empty, { color: colors.mutedForeground }]}>{participantQuery.trim() ? 'No matching people.' : 'Everyone is already in this conversation.'}</Text> : null}
          {people.isError ? <Pressable onPress={() => void people.refetch()} accessibilityRole="button"><Text style={[memberTagStyles.empty, { color: colors.destructive }]}>Could not load people. Tap to retry.</Text></Pressable> : null}
        </> : null}
      </ScrollView>
    </View> : null}
      {messages.isLoading ? <ActivityIndicator style={{ marginTop: 50 }} color={colors.primary} /> : messages.isError ? <View style={styles.center}><Text style={[styles.error, { color: colors.foreground }]}>Unable to load messages.</Text><Text style={{ color: colors.mutedForeground }}>{loadErrorMessage(messages.error)}</Text><Pressable onPress={() => void messages.refetch()} style={[styles.retry, { borderColor: colors.border }]}><Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text></Pressable></View> : <FlatList data={[...visibleMessages].reverse()} inverted keyExtractor={(item) => item.id} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 9 }} removeClippedSubviews initialNumToRender={16} maxToRenderPerBatch={10} windowSize={7} updateCellsBatchingPeriod={50} renderItem={({ item }) => <SwipeableMessage item={item} mine={item.senderId === user?.id} viewerId={user?.id} colors={colors} conversationId={id} onOpenProfile={() => openProfile(item)} onOpenMention={openMentionProfile} onReply={() => { setEditingMessage(null); setReplyingTo(item); }} onEdit={() => beginEdit(item)} onDelete={() => { if (!deleteMessage.isPending) setDeleteTarget(item); }} onReact={(emoji, reacted) => updateReaction(item.id, emoji, reacted)} reactionPending={addReaction.isPending || removeReaction.isPending || deleteMessage.isPending} />} ListEmptyComponent={<View style={styles.center}><Text style={[styles.error, { color: colors.foreground }]}>No messages yet</Text><Text style={{ color: colors.mutedForeground }}>Start the conversation.</Text></View>} />}
       <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) }]}>{mentionSuggestions.length ? <View testID="mention-suggestions" style={[styles.mentionSuggestions, { backgroundColor: colors.card, borderColor: colors.border }]}>{mentionSuggestions.map((person) => <Pressable key={person.id} testID={`mention-suggestion-${person.id}`} onPress={() => insertMention(person)} style={styles.mentionSuggestion}><View style={[styles.mentionAvatar, { backgroundColor: `${colors.primary}20` }]}>{person.profilePhotoUri ? <Image source={{ uri: person.profilePhotoUri }} style={styles.mentionAvatarImage} /> : <Text style={[styles.mentionAvatarText, { color: colors.primary }]}>{person.fullName.charAt(0).toUpperCase()}</Text>}</View><View style={styles.mentionSuggestionText}><Text style={[styles.mentionName, { color: colors.foreground }]}>{person.fullName}</Text><Text style={[styles.mentionRole, { color: colors.mutedForeground }]}>{roleLabel(person.role)}</Text></View></Pressable>)}</View> : null}{editingMessage ? <View style={[styles.editComposer, { borderLeftColor: colors.primary, backgroundColor: `${colors.primary}10` }]}><View style={styles.replyComposerText}><Text style={[styles.replyComposerName, { color: colors.primary }]}>Editing message</Text><Text numberOfLines={1} style={[styles.replyComposerPreview, { color: colors.mutedForeground }]}>{editingMessage.text}</Text></View><Pressable testID="cancel-edit" accessibilityLabel="Cancel editing" onPress={cancelEdit} style={styles.cancelReply}><Feather name="x" size={17} color={colors.mutedForeground} /></Pressable></View> : replyingTo ? <View style={[styles.replyComposer, { borderLeftColor: colors.primary, backgroundColor: `${colors.primary}10` }]}><View style={styles.replyComposerText}><Text style={[styles.replyComposerName, { color: colors.primary }]}>Replying to {replyingTo.senderId === user?.id ? 'yourself' : replyingTo.senderName}</Text><Text numberOfLines={1} style={[styles.replyComposerPreview, { color: colors.mutedForeground }]}>{replyingTo.text || 'Attachment'}</Text></View><Pressable testID="cancel-reply" accessibilityLabel="Cancel reply" onPress={() => setReplyingTo(null)} style={styles.cancelReply}><Feather name="x" size={17} color={colors.mutedForeground} /></Pressable></View> : null}{selectedAttachments.length ? <View style={styles.attachmentQueue}>{selectedAttachments.map((attachment, index) => <Pressable key={`${attachment.uri}-${index}`} onPress={() => setSelectedAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={[styles.queuedAttachment, { backgroundColor: `${colors.primary}18` }]}><Feather name={attachment.contentType.startsWith('image/') ? 'image' : 'paperclip'} size={13} color={colors.primary} /><Text numberOfLines={1} style={[styles.queuedAttachmentText, { color: colors.primary }]}>{attachment.fileName}</Text><Feather name="x" size={13} color={colors.primary} /></Pressable>)}</View> : null}<View style={styles.composerRow}><Pressable testID="add-attachment" onPress={chooseAttachment} disabled={uploading || Boolean(editingMessage)} style={[styles.attach, { borderColor: colors.border, opacity: editingMessage ? 0.4 : 1 }]}><Feather name="paperclip" size={18} color={colors.primary} /></Pressable><TextInput testID="message-composer" value={draft} selection={selection} onChangeText={updateDraft} onSelectionChange={updateSelection} placeholder={editingMessage ? 'Edit your message...' : replyingTo ? 'Write a reply...' : 'Write a message...'} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} onSubmitEditing={() => void send()} returnKeyType="send" /><Pressable testID="send-message" onPress={() => void send()} disabled={sendMessage.isPending || editMessage.isPending || uploading || (!draft.trim() && !selectedAttachments.length)} style={[styles.send, { backgroundColor: (draft.trim() || selectedAttachments.length) && !sendMessage.isPending && !editMessage.isPending && !uploading ? colors.primary : colors.muted }]}><Feather name={sendMessage.isPending || editMessage.isPending || uploading ? 'clock' : editingMessage ? 'check' : 'arrow-up'} size={18} color="#fff" /></Pressable></View></View>
    {sendError ? <Pressable testID="retry-message" onPress={send} style={styles.failure}><Text style={[styles.failureText, { color: colors.primary }]}>{sendError} Tap to retry.</Text></Pressable> : null}
    {actionError ? <Pressable onPress={() => setActionError('')} style={styles.actionFailure}><Text style={[styles.failureText, { color: colors.primary }]}>{actionError} Tap to dismiss.</Text></Pressable> : null}
    <Modal visible={Boolean(deleteTarget)} transparent animationType="slide" onRequestClose={() => setDeleteTarget(null)}>
      <View style={styles.deleteOverlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cancel deletion" onPress={() => setDeleteTarget(null)} />
        <View style={[styles.deleteSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.deleteGroup}>
            <View style={styles.deleteHeading}><Text style={styles.deleteTitle}>Delete message?</Text><Text style={styles.deleteSubtitle}>Choose who can still see this message.</Text></View>
            <Pressable testID="delete-for-me" accessibilityRole="button" onPress={() => deleteTarget && removeMessage(deleteTarget, 'me')} style={styles.deleteOption}><Text style={styles.deleteOptionText}>Delete for me</Text></Pressable>
            {canDeleteForEveryone ? <Pressable testID="delete-for-everyone" accessibilityRole="button" onPress={() => deleteTarget && removeMessage(deleteTarget, 'everyone')} style={styles.deleteOption}><Text style={styles.deleteOptionText}>Delete for everyone</Text></Pressable> : null}
          </View>
          <Pressable testID="cancel-delete" accessibilityRole="button" onPress={() => setDeleteTarget(null)} style={styles.deleteCancel}><Text style={styles.deleteCancelText}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
    {deleteToast ? <Pressable accessibilityRole="alert" onPress={() => setDeleteToast('')} style={styles.deleteToast}><Text style={styles.deleteToastText}>{deleteToast}</Text></Pressable> : null}
       <ProfileModal profile={selectedProfile} colors={colors} catalog={catalog} visible={Boolean(selectedProfile)} canMessage={selectedProfile?.id !== user?.id} loading={createChat.isPending} error={createChat.isError ? 'Could not open a direct message. Please try again.' : ''} onClose={closeProfile} onMessage={messageProfile} />
  </KeyboardAvoidingView>;
}

function SwipeableMessage({ item, mine, viewerId, colors, onOpenProfile, onOpenMention, onReply, onEdit, onDelete, conversationId, onReact, reactionPending }: {
  item: ChatMessage;
  mine: boolean;
  viewerId?: string;
  colors: ReturnType<typeof useColors>;
  onOpenProfile: () => void;
  onOpenMention: (userId: string, displayName: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  conversationId: string;
  onReact: (emoji: MessageReaction['emoji'], reacted: boolean) => void;
  reactionPending: boolean;
}) {
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const openActions = () => setReactionMenuOpen(true);
  const bubble = <View style={styles.messageLayout}>
    {!mine ? <Pressable testID={`open-profile-${item.senderId}`} accessibilityRole="button" accessibilityLabel={`Open ${item.senderName}'s profile`} onPress={onOpenProfile}>{item.senderProfilePhotoUri ? <Image source={{ uri: item.senderProfilePhotoUri }} accessibilityLabel={`${item.senderName} profile picture`} style={styles.messageAvatar} /> : <View style={[styles.messageAvatar, styles.messageAvatarFallback, { backgroundColor: `${colors.primary}20` }]}><Text style={[styles.messageAvatarText, { color: colors.primary }]}>{item.senderName.trim().charAt(0).toUpperCase()}</Text></View>}</Pressable> : null}
    <View style={styles.messageGroup}>
    <Pressable
      testID={`long-press-message-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Message from ${mine ? 'you' : item.senderName}`}
      onPress={openActions}
      onLongPress={onDelete}
      delayLongPress={350}
      style={[styles.bubble, { backgroundColor: mine ? colors.primary : colors.card }]}
    >
       <View style={styles.messageHeader}><Text style={[styles.sender, { color: mine ? '#fff' : colors.mutedForeground }]}>{mine ? 'You' : item.senderName}</Text><View style={styles.messageMeta}><Text style={[styles.timestamp, { color: mine ? '#ffffffb8' : colors.mutedForeground }]}>{formatMessageTime(item.createdAt)}</Text>{item.edited && !item.deletedForEveryone ? <Text style={[styles.edited, { color: mine ? '#ffffffb8' : colors.mutedForeground }]}>(edited)</Text> : null}</View></View>
       {item.replyTo ? <View style={[styles.replyPreview, { borderLeftColor: mine ? '#ffffffaa' : colors.primary, backgroundColor: mine ? '#ffffff18' : `${colors.primary}0D` }]}><Text style={[styles.replyName, { color: mine ? '#fff' : colors.primary }]}>Replying to {item.replyTo.senderId === viewerId ? 'You' : item.replyTo.senderName}</Text><Text numberOfLines={2} style={[styles.replyText, { color: mine ? '#ffffffcc' : colors.mutedForeground }]}>{item.replyTo.text}</Text></View> : null}
       {item.deletedForEveryone ? <Text style={[styles.deletedMessage, { color: mine ? '#ffffffcc' : colors.mutedForeground }]}>This message was deleted</Text> : item.text ? <MentionText text={item.text} mentions={item.mentions ?? []} mine={mine} colors={colors} onOpenMention={onOpenMention} /> : null}
      {item.attachments?.map((attachment) => <AttachmentCard key={attachment.id} attachment={attachment} conversationId={conversationId} mine={mine} colors={colors} />)}
    </Pressable>
    {!item.deletedForEveryone ? <MessageReactions
      reactions={item.reactions ?? []}
      colors={colors}
      conversationId={conversationId}
      messageId={item.id}
      disabled={reactionPending}
      visible={reactionMenuOpen}
      onReact={onReact}
      onDismiss={() => setReactionMenuOpen(false)}
    /> : null}
    {reactionMenuOpen ? <View style={styles.messageActions}>{!item.deletedForEveryone ? <><Pressable testID={`reply-message-${item.id}`} accessibilityRole="button" accessibilityLabel={`Reply to ${mine ? 'your message' : item.senderName}`} onPress={() => { setReactionMenuOpen(false); onReply(); }} style={[styles.replyAction, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="message-square" size={15} color={colors.primary} /><Text style={[styles.replyActionText, { color: colors.primary }]}>Reply</Text></Pressable>{mine && item.text ? <Pressable testID={`edit-message-${item.id}`} accessibilityRole="button" onPress={() => { setReactionMenuOpen(false); onEdit(); }} style={[styles.replyAction, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="edit-2" size={15} color={colors.primary} /><Text style={[styles.replyActionText, { color: colors.primary }]}>Edit</Text></Pressable> : null}</> : null}<Pressable testID={`delete-message-${item.id}`} accessibilityRole="button" onPress={() => { setReactionMenuOpen(false); onDelete(); }} style={[styles.replyAction, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="trash-2" size={15} color={colors.destructive} /><Text style={[styles.replyActionText, { color: colors.destructive }]}>Delete</Text></Pressable></View> : null}
    </View>
  </View>;
  if (Platform.OS === 'web') return <View style={[styles.webMessageRow, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>{bubble}</View>;
  return <View style={[styles.swipeContainer, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>{bubble}</View>;
}

function MentionText({ text, mentions, mine, colors, onOpenMention }: { text: string; mentions: MessageMention[]; mine: boolean; colors: ReturnType<typeof useColors>; onOpenMention: (userId: string, displayName: string) => void }) {
  const validMentions = [...mentions].sort((a, b) => a.start - b.start).filter((mention, index, sorted) => mention.start >= 0 && mention.end <= text.length && mention.end > mention.start && (index === 0 || mention.start >= sorted[index - 1].end) && text.slice(mention.start, mention.end) === `@${mention.displayName}`);
  if (!validMentions.length) return <Text style={[styles.message, { color: mine ? '#fff' : colors.foreground }]}>{text}</Text>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  validMentions.forEach((mention) => {
    if (mention.start > cursor) parts.push(text.slice(cursor, mention.start));
    parts.push(<Text key={`${mention.userId}-${mention.start}`} accessibilityRole="link" onPress={() => onOpenMention(mention.userId, mention.displayName)} style={[styles.mentionText, { color: mine ? '#fff' : colors.primary }]}>{text.slice(mention.start, mention.end)}</Text>);
    cursor = mention.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <Text style={[styles.message, { color: mine ? '#fff' : colors.foreground }]}>{parts}</Text>;
}

const memberTagStyles = StyleSheet.create({
  tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  text: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 3 },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarImage: { width: 36, height: 36 },
  addAction: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  search: { minHeight: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, paddingVertical: 8 },
  empty: { fontFamily: 'Inter_400Regular', fontSize: 11, paddingVertical: 8 },
});

function roleLabel(role: string) {
  if (role === 'Admin') return 'Admin';
  if (role === 'Staff-Coach') return 'Staff-Coach';
  if (role === 'Parent-Athlete') return 'Parent/Guardian';
  if (role === 'Athlete') return 'Athlete';
  return role;
}

function teamLabel(team: string) {
  return LPA_TEAMS.find((name) => teamEventAliases[name].includes(team)) ?? team;
}

function ProfileModal({ profile, colors, catalog, visible, canMessage, loading, error, onClose, onMessage }: {
  profile: SelectedProfile | null;
  colors: ReturnType<typeof useColors>;
  visible: boolean;
  canMessage: boolean;
  loading: boolean;
  error: string;
  onClose: () => void;
  onMessage: () => void;
  catalog: any;
}) {
  if (!profile) return null;
  const initials = profile.fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.profileOverlay}>
      <Pressable accessibilityLabel="Close profile" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable testID="close-profile" accessibilityLabel="Close profile" onPress={onClose} style={styles.profileClose}><Feather name="x" size={18} color={colors.mutedForeground} /></Pressable>
        {profile.profilePhotoUri ? <Image source={{ uri: profile.profilePhotoUri }} accessibilityLabel={`${profile.fullName} profile picture`} resizeMode="cover" style={styles.profileImage} /> : <View style={[styles.profileImage, styles.profileImageFallback, { backgroundColor: `${colors.primary}20` }]}><Text style={[styles.profileInitials, { color: colors.primary }]}>{initials}</Text></View>}
        <Text style={[styles.profileName, { color: colors.foreground }]}>{profile.fullName}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {profile.role ? <View style={[memberTagStyles.tag, { backgroundColor: colors.secondary }]}><Text style={[memberTagStyles.text, { color: colors.primary }]}>{tagLabel(catalog, 'role', profile.roleTag ?? profile.role)}</Text></View> : null}
          {[...new Set(profile.teams.map((team) => tagLabel(catalog, 'team', team)))].map((team) => <View key={team} style={[memberTagStyles.tag, { backgroundColor: colors.secondary }]}><Text style={[memberTagStyles.text, { color: colors.primary }]}>{team}</Text></View>)}
        </View>
        {error ? <Text style={[styles.profileError, { color: colors.destructive }]}>{error}</Text> : null}
        {canMessage ? <Pressable testID="message-profile" accessibilityRole="button" accessibilityLabel={`Message ${profile.fullName}`} disabled={loading} onPress={onMessage} style={[styles.profileMessageButton, { backgroundColor: colors.primary, opacity: loading ? 0.65 : 1 }]}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="message-square" size={17} color="#fff" />}
          <Text style={styles.profileMessageText}>{loading ? 'Opening message…' : 'Message'}</Text>
        </Pressable> : null}
      </View>
    </View>
  </Modal>;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function AttachmentCard({ attachment, conversationId, mine, colors }: { attachment: MessageAttachment; conversationId: string; mine: boolean; colors: ReturnType<typeof useColors> }) {
  const [url, setUrl] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  useEffect(() => {
    if (!attachment.id) return;
    void customFetch<{ url: string }>(`/api/chats/${conversationId}/attachments/${attachment.id}/access-url`, {
      responseType: 'json',
      suppressUnauthorizedHandler: true,
    }).then((value) => setUrl(value.url)).catch(() => undefined);
  }, [attachment.id, conversationId]);
  const foreground = mine ? '#fff' : colors.foreground;
  if (attachment.contentType.startsWith('image/')) return url ? <><Pressable testID={`open-photo-${attachment.id}`} accessibilityLabel={`Open ${attachment.fileName}`} onPress={() => setViewerOpen(true)}><Image source={{ uri: url }} accessibilityLabel={attachment.fileName} style={styles.attachmentImage} /></Pressable><MessagePhotoViewer visible={viewerOpen} url={url} fileName={attachment.fileName} contentType={attachment.contentType} downloadPath={`/api/chats/${conversationId}/attachments/${attachment.id}`} onClose={() => setViewerOpen(false)} /></> : <Text style={[styles.attachmentLoading, { color: foreground }]}>Loading image…</Text>;
  return <Pressable onPress={() => url ? void Linking.openURL(url) : undefined} style={[styles.fileAttachment, { borderColor: mine ? '#ffffff66' : colors.border }]}><Feather name="file-text" size={17} color={foreground} /><Text numberOfLines={1} style={[styles.fileAttachmentName, { color: foreground }]}>{attachment.fileName}</Text><Feather name="download" size={15} color={foreground} /></Pressable>;
}

const styles = StyleSheet.create({
  deleteOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000060' },
  deleteSheet: { width: '100%', maxWidth: 500, alignSelf: 'center', paddingHorizontal: 8, paddingTop: 8, gap: 8 },
  deleteGroup: { borderRadius: 14, backgroundColor: '#F2F2F7', overflow: 'hidden' },
  deleteHeading: { paddingHorizontal: 18, paddingVertical: 16, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8' },
  deleteTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#3C3C43' },
  deleteSubtitle: { marginTop: 4, fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', textAlign: 'center' },
  deleteOption: { minHeight: 58, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8' },
  deleteOptionText: { fontSize: 19, fontFamily: 'Inter_400Regular', color: '#FF3B30' },
  deleteCancel: { minHeight: 58, borderRadius: 14, backgroundColor: '#F2F2F7', alignItems: 'center', justifyContent: 'center' },
  deleteCancelText: { fontSize: 19, fontFamily: 'Inter_600SemiBold', color: '#007AFF' },
  deleteToast: { position: 'absolute', bottom: 96, left: 20, right: 20, alignSelf: 'center', backgroundColor: '#26262B', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14, elevation: 10 },
  deleteToastText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center' },
  container: { flex: 1 }, header: { height: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }, headerActions: { minWidth: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 13 }, title: { flex: 1, textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 17 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7 }, error: { fontFamily: 'Inter_700Bold', fontSize: 15 }, retry: { marginTop: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }, retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, participantPanel: { marginHorizontal: 16, marginTop: 3, borderWidth: 1, borderRadius: 15, padding: 12, gap: 8 }, participantHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, participantTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 }, participantRow: { minHeight: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, participantName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 }, removeText: { fontFamily: 'Inter_700Bold', fontSize: 11 }, addLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1, marginTop: 5 }, addText: { fontFamily: 'Inter_700Bold', fontSize: 11 }, swipeContainer: { maxWidth: '92%', borderRadius: 16 }, webMessageRow: { maxWidth: '92%', gap: 5 }, messageLayout: { maxWidth: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 7 }, messageGroup: { maxWidth: '100%', flexShrink: 1 }, messageAvatar: { width: 30, height: 30, borderRadius: 15, marginBottom: 4 }, messageAvatarFallback: { alignItems: 'center', justifyContent: 'center' }, messageAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 11 }, bubble: { maxWidth: '100%', borderRadius: 16, padding: 11 }, messageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }, messageMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 }, sender: { fontFamily: 'Inter_600SemiBold', fontSize: 10 }, timestamp: { fontFamily: 'Inter_400Regular', fontSize: 9 }, edited: { fontFamily: 'Inter_400Regular', fontSize: 9 }, message: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 }, deletedMessage: { fontFamily: 'Inter_400Regular', fontSize: 13, fontStyle: 'italic', lineHeight: 19 }, mentionText: { fontFamily: 'Inter_700Bold', textDecorationLine: 'underline' }, replyPreview: { borderLeftWidth: 3, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 7 }, replyName: { fontFamily: 'Inter_700Bold', fontSize: 10, marginBottom: 2 }, replyText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15 }, messageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, replyAction: { alignSelf: 'flex-start', minHeight: 34, marginTop: 4, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 }, replyActionText: { fontFamily: 'Inter_700Bold', fontSize: 11 }, profileOverlay: { flex: 1, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', padding: 24 }, profileCard: { width: '100%', maxWidth: 340, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, profileClose: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, profileImage: { width: 128, height: 128, borderRadius: 64, marginBottom: 15 }, profileImageFallback: { alignItems: 'center', justifyContent: 'center' }, profileInitials: { fontFamily: 'Inter_700Bold', fontSize: 30 }, profileName: { fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center' }, profileRole: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 5 }, profileError: { fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'center', marginTop: 12 }, profileMessageButton: { minHeight: 44, alignSelf: 'stretch', borderRadius: 13, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, profileMessageText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 }, composer: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 10 }, mentionSuggestions: { maxHeight: 220, marginBottom: 8, borderWidth: 1, borderRadius: 13, paddingVertical: 4, overflow: 'hidden' }, mentionSuggestion: { minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9 }, mentionAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, mentionAvatarImage: { width: 30, height: 30 }, mentionAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 11 }, mentionSuggestionText: { flex: 1 }, mentionName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, mentionRole: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 1 }, replyComposer: { borderLeftWidth: 3, borderRadius: 9, marginBottom: 8, paddingLeft: 9, paddingRight: 5, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8 }, editComposer: { borderLeftWidth: 3, borderRadius: 9, marginBottom: 8, paddingLeft: 9, paddingRight: 5, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8 }, replyComposerText: { flex: 1 }, replyComposerName: { fontFamily: 'Inter_700Bold', fontSize: 11, marginBottom: 2 }, replyComposerPreview: { fontFamily: 'Inter_400Regular', fontSize: 11 }, cancelReply: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }, composerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, attach: { width: 38, height: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, height: 42, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 13 }, send: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }, attachmentQueue: { gap: 5, marginBottom: 8 }, queuedAttachment: { height: 30, borderRadius: 9, paddingHorizontal: 9, flexDirection: 'row', gap: 6, alignItems: 'center' }, queuedAttachmentText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11 }, attachmentImage: { width: 210, height: 150, borderRadius: 10, marginTop: 7, backgroundColor: '#00000018' }, attachmentLoading: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7 }, fileAttachment: { borderWidth: 1, borderRadius: 10, marginTop: 7, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: 240 }, fileAttachmentName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11 }, failure: { position: 'absolute', bottom: 70, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 8 }, actionFailure: { position: 'absolute', top: 65, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 8 }, failureText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'center' },
});