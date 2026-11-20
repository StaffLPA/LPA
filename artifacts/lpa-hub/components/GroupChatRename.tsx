import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useRenameGroupChat } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type Props = {
  conversationId: string;
  name: string;
  onRenamed: (updated: { id: string; name: string }) => void;
};

export function GroupChatRename({ conversationId, name, onRenamed }: Props) {
  const colors = useColors();
  const rename = useRenameGroupChat();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const save = () => {
    const nextName = draft.trim();
    if (!nextName || nextName.length > 100 || rename.isPending) return;
    setError('');
    rename.mutate({ conversationId, data: { name: nextName } }, {
      onSuccess: updated => { onRenamed(updated); setEditing(false); setError(''); },
      onError: failure => {
        const details = failure as { status?: number; data?: { message?: string } };
        setError(details.status === 404 && !details.data?.message
          ? 'Renaming is unavailable on this server. Publish the updated API and try again.'
          : details.data?.message ?? 'Could not rename the group. Check your connection and try again.');
      },
    });
  };
  return <View style={{ gap: 10, paddingBottom: 12 }}>
    {!editing ? <Pressable
      testID="rename-group"
      accessibilityRole="button"
      onPress={() => { setDraft(name); setError(''); setEditing(true); }}
      style={{ paddingVertical: 10 }}
    ><Text style={{ color: colors.primary, fontWeight: '600' }}>Rename group</Text></Pressable> : <>
      <Text style={{ color: colors.foreground, fontWeight: '600' }}>Group name</Text>
      <TextInput
        testID="group-name-input"
        accessibilityLabel="Group name"
        value={draft}
        onChangeText={setDraft}
        maxLength={100}
        editable={!rename.isPending}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        style={{ borderWidth: 1, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, borderRadius: 8, padding: 12 }}
      />
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <Pressable testID="save-group-name" accessibilityRole="button" disabled={rename.isPending || !draft.trim()} onPress={save} style={{ paddingVertical: 10, opacity: !draft.trim() ? 0.5 : 1 }}>
          {rename.isPending ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontWeight: '600' }}>Save name</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={rename.isPending} onPress={() => { setEditing(false); setError(''); }} style={{ paddingVertical: 10 }}>
          <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
        </Pressable>
      </View>
    </>}
  </View>;
}
