import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { customFetch } from '@workspace/api-client-react';
import { CachedImage } from '@/components/CachedImage';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { groupPhotoErrorMessage, prepareGroupChatPhoto } from '@/lib/groupChatPhotoUpload';

export function GroupChatAvatar({ name, photoUri, size = 46, radius = 16 }: { name: string; photoUri?: string | null; size?: number; radius?: number }) {
  const colors = useColors();
  if (photoUri) return <CachedImage source={{ uri: photoUri }} accessibilityLabel={`${name} group photo`} contentFit="cover" style={{ width: size, height: size, borderRadius: radius }} />;
  return <View style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primary}20` }}><Feather name="users" size={Math.round(size * 0.42)} color={colors.primary} /></View>;
}

export function GroupChatPhotoEditor({ conversationId, name, photoUri, canEdit, onChanged }: {
  conversationId: string; name: string; photoUri?: string | null; canEdit: boolean; onChanged: (photoUri: string | null) => void;
}) {
  const colors = useColors();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const fail = (e: unknown, fallback: string) => {
    setError(groupPhotoErrorMessage(e, fallback));
  };
  const change = async () => {
    if (busy) return;
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [1, 1], base64: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0] as ImagePicker.ImagePickerAsset & { file?: Blob };
      setBusy('upload');
      const { body, contentType } = await prepareGroupChatPhoto(asset);
      const res = await customFetch<{ photoUri: string }>(`/api/chats/${encodeURIComponent(conversationId)}/photo`, {
        method: 'POST', responseType: 'json', suppressUnauthorizedHandler: true, headers: { 'content-type': contentType }, body,
      });
      onChanged(res.photoUri);
    } catch (e) { fail(e, 'Could not update the group photo. Please try again.'); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (busy) return;
    setError(''); setBusy('remove');
    try {
      await customFetch<{ photoUri: null }>(`/api/chats/${encodeURIComponent(conversationId)}/photo`, { method: 'DELETE', responseType: 'json', suppressUnauthorizedHandler: true });
      onChanged(null);
    } catch (e) { fail(e, 'Could not remove the group photo. Please try again.'); } finally { setBusy(null); }
  };
  return <View testID="group-photo-editor" style={s.wrap}>
    <View>
      <GroupChatAvatar name={name} photoUri={photoUri} size={56} radius={18} />
      {busy ? <View style={[s.overlay, { backgroundColor: `${colors.card}cc` }]}><ActivityIndicator color={colors.primary} accessibilityLabel={busy === 'upload' ? 'Uploading group photo' : 'Removing group photo'} /></View> : null}
    </View>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={[s.title, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
      {canEdit ? <View style={s.actions}>
        <Pressable testID="change-group-photo" accessibilityRole="button" accessibilityState={{ disabled: Boolean(busy), busy: busy === 'upload' }} disabled={Boolean(busy)} onPress={() => void change()} style={s.action}>
          <Feather name="camera" size={14} color={colors.primary} /><Text style={[s.actionText, { color: colors.primary }]}>{busy === 'upload' ? 'Uploading…' : 'Change group photo'}</Text>
        </Pressable>
        {photoUri ? <Pressable testID="remove-group-photo" accessibilityRole="button" accessibilityState={{ disabled: Boolean(busy), busy: busy === 'remove' }} disabled={Boolean(busy)} onPress={() => void remove()} style={s.action}>
          <Text style={[s.actionText, { color: colors.destructive }]}>{busy === 'remove' ? 'Removing…' : 'Remove'}</Text>
        </Pressable> : null}
      </View> : <Text style={[s.hint, { color: colors.mutedForeground }]}>Everyone in this group can send photos and files.</Text>}
      {error ? <Text testID="group-photo-error" accessibilityRole="alert" style={[s.hint, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  </View>;
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  actions: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  action: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 11 },
});
