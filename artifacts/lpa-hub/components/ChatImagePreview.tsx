import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { chatPhotoBounds, fitChatPhoto, type PhotoSize } from '@/lib/chatPhotoLayout';

type Props = {
  url: string;
  fileName: string;
  attachmentId: string;
  onOpen: () => void;
  onError: () => void;
};

export function ChatImagePreview({ url, fileName, attachmentId, onOpen, onError }: Props) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [decoded, setDecoded] = useState<(PhotoSize & { url: string }) | null>(null);
  const size = decoded?.url === url ? fitChatPhoto(decoded, chatPhotoBounds(width)) : null;
  return <Pressable
    testID={`open-photo-${attachmentId}`}
    accessibilityRole="button"
    accessibilityLabel={`Open ${fileName}`}
    onPress={onOpen}
    style={styles.preview}
  >
    <Image
      source={{ uri: url }}
      resizeMode="contain"
      accessibilityLabel={fileName}
      onLoad={(event) => {
        const source = event.nativeEvent.source;
        if (!fitChatPhoto(source, chatPhotoBounds(width))) { onError(); return; }
        setDecoded({ url, width: source.width, height: source.height });
      }}
      onError={onError}
      style={[styles.image, size ?? styles.loadingSize, { opacity: size ? 1 : 0 }]}
    />
    {!size ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={colors.primary} /></View> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  preview: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, marginTop: 7 },
  image: { borderRadius: 10, flexShrink: 0 },
  loadingSize: { width: 44, height: 44 },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
