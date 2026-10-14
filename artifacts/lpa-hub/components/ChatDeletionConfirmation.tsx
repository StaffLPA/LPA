import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export function ChatDeletionConfirmation({ kind, visible, pending, error, onConfirm, onCancel, embedded = false }: {
  kind: 'message' | 'conversation';
  visible: boolean;
  pending: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
  embedded?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cancel = () => { if (!pending) onCancel(); };
  const content = <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cancel deletion" disabled={pending} onPress={cancel} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Permanently delete {kind} for me?</Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          {kind === 'message'
            ? 'This message will be permanently removed from your account on all devices. Other participants will still see it.'
            : 'This conversation and its history will be permanently removed from your account on all devices. Other participants will keep the conversation and all messages. New messages in this same conversation will also stay hidden.'}
          {'\n\n'}This cannot be undone.
        </Text>
        {error ? <Text testID={`delete-${kind}-error`} accessibilityRole="alert" style={[styles.copy, { color: colors.destructive }]}>{error}</Text> : null}
        <Pressable testID={kind === 'message' ? 'delete-for-me' : 'confirm-delete-conversation'} accessibilityRole="button" disabled={pending} onPress={onConfirm} style={[styles.button, { backgroundColor: colors.destructive, opacity: pending ? 0.6 : 1 }]}>
          <Text style={styles.buttonText}>{pending ? 'Deleting…' : 'Permanently delete for me'}</Text>
        </Pressable>
        <Pressable testID={kind === 'message' ? 'cancel-delete' : 'cancel-delete-conversation'} accessibilityRole="button" disabled={pending} onPress={cancel} style={styles.cancel}>
          <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancel</Text>
        </Pressable>
      </View>
    </View>;
  // Reuse an already-open options modal rather than presenting two native
  // modals during the same iOS dismissal animation.
  return embedded ? content : <Modal visible={visible} transparent animationType="slide" onRequestClose={cancel}>{content}</Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 22, paddingTop: 24 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 12 },
  copy: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginBottom: 18 },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#fff' },
  cancel: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});
