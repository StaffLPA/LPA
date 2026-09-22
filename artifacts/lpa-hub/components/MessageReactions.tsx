import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getListChatMessageReactionUsersQueryKey, useListChatMessageReactionUsers, type MessageReaction } from '@workspace/api-client-react';

const REACTION_EMOJIS: MessageReaction['emoji'][] = [
  '👍', '❤️', '😂', '😮', '😢', '🎉',
  '👏', '🙌', '🔥', '💯', '😍', '🤔',
  '😎', '😡', '👎', '🤣', '🥳', '🤩',
  '🙏', '💪', '👀', '⚾', '✅', '⭐',
];

const QUICK_REACTION_EMOJIS = REACTION_EMOJIS.slice(0, 4);
const REACTION_NAMES: Partial<Record<MessageReaction['emoji'], string>> = {
  '👍': 'Like',
  '❤️': 'Love',
  '😂': 'Laugh',
  '😮': 'Wow',
};

export function MessageReactions({
  reactions,
  colors,
  conversationId,
  messageId,
  disabled,
  onReact,
  visible = false,
  onDismiss,
}: {
  reactions: MessageReaction[];
  colors: { primary: string; card: string; border: string; foreground: string; mutedForeground: string };
  conversationId: string;
  messageId: string;
  disabled?: boolean;
  onReact: (emoji: MessageReaction['emoji'], reacted: boolean) => void;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<MessageReaction['emoji'] | null>(null);
  const queryClient = useQueryClient();
  const reactionUsers = useListChatMessageReactionUsers(conversationId, messageId, selectedEmoji ?? '👍', {
    query: {
      enabled: Boolean(selectedEmoji),
      queryKey: getListChatMessageReactionUsersQueryKey(conversationId, messageId, selectedEmoji ?? '👍'),
    },
  });
  if (!reactions.length && !visible) return null;

  const pickerEmojis = pickerOpen ? REACTION_EMOJIS : QUICK_REACTION_EMOJIS;
  const selectedReaction = selectedEmoji ? reactions.find((reaction) => reaction.emoji === selectedEmoji) : undefined;
  const chooseReaction = (emoji: MessageReaction['emoji']) => {
    const current = reactions.find((reaction) => reaction.emoji === emoji);
    onReact(emoji, Boolean(current?.reacted));
    void queryClient.invalidateQueries({ queryKey: getListChatMessageReactionUsersQueryKey(conversationId, messageId, emoji) });
    setPickerOpen(false);
    onDismiss?.();
  };

  return (
    <View style={styles.wrapper}>
      {reactions.length ? (
        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {reactions.map((reaction) => (
            <Pressable
              key={reaction.emoji}
              testID={`message-reaction-${reaction.emoji}`}
              accessibilityRole="button"
              accessibilityLabel={`Show who used ${reaction.emoji}, ${reaction.count} reaction${reaction.count === 1 ? '' : 's'}`}
              disabled={disabled || reactionUsers.isFetching}
              onPress={() => setSelectedEmoji((current) => current === reaction.emoji ? null : reaction.emoji)}
              style={[
                styles.chip,
                { borderColor: selectedEmoji === reaction.emoji || reaction.reacted ? colors.primary : colors.border, backgroundColor: reaction.reacted ? `${colors.primary}18` : colors.card },
              ]}
            >
              <Text style={styles.emoji}>{reaction.emoji}</Text>
              <Text style={[styles.count, { color: reaction.reacted ? colors.primary : colors.foreground }]}>{reaction.count}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {visible ? (
        <View style={[styles.row, styles.pickerRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {pickerEmojis.map((emoji) => (
            <Pressable
              key={emoji}
              testID={`reaction-picker-${emoji}`}
              accessibilityRole="button"
              accessibilityLabel={`React with ${emoji}`}
              disabled={disabled}
              onPress={() => chooseReaction(emoji)}
              style={styles.pickerEmoji}
            >
              <Text style={styles.pickerEmojiText}>{emoji}</Text>
            </Pressable>
          ))}
          {!pickerOpen ? (
            <Pressable
              testID="open-reaction-picker"
              accessibilityRole="button"
              accessibilityLabel="Show more reactions"
              disabled={disabled}
              onPress={() => setPickerOpen(true)}
              style={[styles.addButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.addText, { color: colors.mutedForeground }]}>+</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {selectedEmoji ? (
        <View style={[styles.details, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.detailsHeader}>
            <Text style={[styles.detailsTitle, { color: colors.foreground }]}>{REACTION_NAMES[selectedEmoji] ?? `${selectedEmoji} reaction`}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close reaction details"
              onPress={() => setSelectedEmoji(null)}
              style={styles.closeButton}
            >
              <Text style={[styles.closeText, { color: colors.mutedForeground }]}>×</Text>
            </Pressable>
          </View>
          {reactionUsers.isLoading ? <View style={styles.detailsState}><ActivityIndicator color={colors.primary} /><Text style={[styles.detailsStateText, { color: colors.mutedForeground }]}>Loading reactions…</Text></View> : null}
          {reactionUsers.isError ? <Pressable onPress={() => void reactionUsers.refetch()} style={styles.detailsState}><Text style={[styles.detailsStateText, { color: colors.primary }]}>Could not load reactions. Tap to retry.</Text></Pressable> : null}
          {!reactionUsers.isLoading && !reactionUsers.isError && reactionUsers.data?.users.length === 0 ? <Text style={[styles.detailsStateText, { color: colors.mutedForeground }]}>No one has used this reaction.</Text> : null}
          {!reactionUsers.isLoading && !reactionUsers.isError ? reactionUsers.data?.users.map((user) => (
            <View key={user.id} style={[styles.userRow, { borderTopColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: `${colors.primary}24` }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{user.fullName.trim().charAt(0).toUpperCase()}</Text></View>
              <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>{user.fullName}</Text>
              <Text style={styles.userEmoji}>{selectedEmoji}</Text>
            </View>
          )) : null}
          {selectedReaction && reactionUsers.data?.users.length ? <Text style={[styles.detailsCount, { color: colors.mutedForeground }]}>{selectedReaction.count} total</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: -3 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, borderWidth: 1, borderRadius: 14, padding: 4 },
  pickerRow: { marginTop: 4 },
  chip: { minHeight: 28, borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  emoji: { fontSize: 15 },
  count: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  pickerEmoji: { minWidth: 29, minHeight: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  pickerEmojiText: { fontSize: 18 },
  addButton: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 14 },
  addText: { fontFamily: 'Inter_700Bold', fontSize: 17, lineHeight: 20 },
  details: { minWidth: 220, maxWidth: 300, marginTop: 4, borderWidth: 1, borderRadius: 12, padding: 8 },
  detailsHeader: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  detailsTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 12 },
  closeButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 19, lineHeight: 21 },
  detailsState: { minHeight: 34, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6 },
  detailsStateText: { fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'center' },
  userRow: { minHeight: 36, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  avatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  userName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  userEmoji: { fontSize: 16 },
  detailsCount: { fontFamily: 'Inter_400Regular', fontSize: 10, paddingTop: 4 },
});