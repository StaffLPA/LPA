import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Alert, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { customFetch } from '@workspace/api-client-react';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { constrainPhotoPan, photoMaximumScale, type PhotoSize } from '@/lib/chatPhotoLayout';

type Props = {
  visible: boolean;
  url: string;
  fileName: string;
  contentType: string;
  downloadPath: string;
  onClose: () => void;
};

const minimumScale = 1;
const extensionForContentType = (contentType: string) => {
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'image/gif') return '.gif';
  if (contentType === 'image/heic' || contentType === 'image/heif') return '.heic';
  return '.jpg';
};
const downloadableFileName = (fileName: string, contentType: string) => {
  const sanitized = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || `lpa-photo-${Date.now()}`;
  return /\.[a-zA-Z0-9]{2,5}$/.test(sanitized) ? sanitized : `${sanitized}${extensionForContentType(contentType)}`;
};
const distance = (touches: readonly { pageX: number; pageY: number }[]) => {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
};

export function MessagePhotoViewer({ visible, url, fileName, contentType, downloadPath, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;
  const currentScale = useRef(1);
  const translation = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const currentPan = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0, dx: 0, dy: 0 });
  const imageSize = useRef<PhotoSize>({ width: 0, height: 0 });
  const viewportSize = useRef<PhotoSize>({ width: 0, height: 0 });
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const lastTapAt = useRef(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    currentScale.current = 1;
    currentPan.current = { x: 0, y: 0 };
    pinchStartDistance.current = 0;
    lastTapAt.current = 0;
    scale.setValue(1);
    translation.setValue({ x: 0, y: 0 });
  }, [visible, url, scale, translation]);

  const setPan = (next: { x: number; y: number }) => {
    const bounded = constrainPhotoPan(next, imageSize.current, viewportSize.current, currentScale.current);
    currentPan.current = bounded;
    translation.setValue(bounded);
  };

  const setScale = (next: number, animated = false) => {
    const normalized = Math.min(photoMaximumScale(imageSize.current, viewportSize.current), Math.max(minimumScale, next));
    currentScale.current = normalized;
    if (animated) Animated.spring(scale, { toValue: normalized, useNativeDriver: true, bounciness: 0 }).start();
    else scale.setValue(normalized);
    setPan(currentPan.current);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => gesture.numberActiveTouches >= 2 || currentScale.current > 1,
    onPanResponderGrant: (event) => {
      const now = Date.now();
      if (now - lastTapAt.current < 280 && event.nativeEvent.touches.length < 2) {
        setScale(currentScale.current > 1 ? 1 : 2.5, true);
        lastTapAt.current = 0;
      } else {
        lastTapAt.current = now;
      }
      pinchStartDistance.current = distance(event.nativeEvent.touches);
      pinchStartScale.current = currentScale.current;
      panOrigin.current = { ...currentPan.current, dx: 0, dy: 0 };
    },
    onPanResponderMove: (event, gesture) => {
      const nextDistance = distance(event.nativeEvent.touches);
      if (nextDistance) {
        // A second finger can join after a one-finger gesture already began.
        if (!pinchStartDistance.current) {
          pinchStartDistance.current = nextDistance;
          pinchStartScale.current = currentScale.current;
        }
        setScale(pinchStartScale.current * (nextDistance / pinchStartDistance.current));
        panOrigin.current = { ...currentPan.current, dx: gesture.dx, dy: gesture.dy };
      } else {
        if (pinchStartDistance.current) {
          pinchStartDistance.current = 0;
          panOrigin.current = { ...currentPan.current, dx: gesture.dx, dy: gesture.dy };
        }
        const origin = panOrigin.current;
        setPan({ x: origin.x + gesture.dx - origin.dx, y: origin.y + gesture.dy - origin.dy });
      }
    },
    onPanResponderRelease: () => {
      pinchStartDistance.current = 0;
      if (currentScale.current < 1.05) setScale(1, true);
    },
    onPanResponderTerminate: () => { pinchStartDistance.current = 0; setPan(currentPan.current); },
  }), [scale, translation]);

  const close = () => {
    setScale(1);
    onClose();
  };

  const download = async () => {
    if (!url || saving) return;
    setSaving(true);
    let cachedFile: ExpoFile | null = null;
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = await customFetch<Blob>(downloadPath, {
          responseType: 'blob',
          suppressUnauthorizedHandler: true,
        });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = downloadableFileName(fileName, contentType);
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        const MediaLibrary = await import('expo-media-library');
        if (!await MediaLibrary.isAvailableAsync()) {
          Alert.alert('Download unavailable', 'This device does not provide access to a photo library.');
          return;
        }
        const permission = await MediaLibrary.requestPermissionsAsync(true);
        if (!permission.granted) {
          Alert.alert('Photo access needed', 'Allow LPA to add photos in your device settings, then try again.');
          return;
        }
        const destination = new ExpoFile(Paths.cache, `${Date.now()}-${downloadableFileName(fileName, contentType)}`);
        cachedFile = destination;
        await ExpoFile.downloadFileAsync(url, destination, { idempotent: true });
        await MediaLibrary.saveToLibraryAsync(destination.uri);
        Alert.alert('Photo saved', 'The image was saved to your Photos or Gallery app.');
      }
    } catch {
      if (Platform.OS === 'web') {
        Alert.alert('Download failed', 'The image could not be downloaded. Please try again.');
      } else {
        Alert.alert('Photo not saved', 'The image could not be saved to this device. Please try again.');
      }
    } finally {
      if (cachedFile?.exists) {
        try { cachedFile.delete(); } catch { /* The device can clear cached downloads later. */ }
      }
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.toolbar, { paddingTop: insets.top + 10 }]}>
          <Pressable testID="close-photo-viewer" accessibilityLabel="Close photo" onPress={close} style={styles.control}>
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
          <Text numberOfLines={1} style={styles.fileName}>{fileName}</Text>
          <Pressable testID="download-message-photo" accessibilityLabel="Download photo" disabled={saving} onPress={() => void download()} style={styles.control}>
            <Feather name={saving ? 'clock' : 'download'} size={22} color="#FFFFFF" />
          </Pressable>
        </View>
        <View testID="message-photo-stage" style={styles.stage}
          onLayout={(event) => { viewportSize.current = event.nativeEvent.layout; setPan(currentPan.current); }}
          {...panResponder.panHandlers}>
          <Animated.Image source={{ uri: url }} resizeMode="contain" accessibilityLabel={fileName}
            onLoad={(event) => { imageSize.current = event.nativeEvent.source; setPan(currentPan.current); }}
            style={[styles.image, { transform: [{ translateX: translation.x }, { translateY: translation.y }, { scale }] }]} />
        </View>
        <View style={styles.zoomControls}>
          <Pressable testID="zoom-out-message-photo" accessibilityRole="button" accessibilityLabel="Zoom out" style={styles.control} onPress={() => setScale(currentScale.current / 1.5, true)}><Feather name="minus" size={22} color="#FFFFFF" /></Pressable>
          <Text style={styles.hint}>Pinch or double-tap to zoom{'\n'}Drag when zoomed to see details</Text>
          <Pressable testID="zoom-in-message-photo" accessibilityRole="button" accessibilityLabel="Zoom in" style={styles.control} onPress={() => setScale(currentScale.current * 1.5, true)}><Feather name="plus" size={22} color="#FFFFFF" /></Pressable>
        </View>
        <View style={{ height: Math.max(insets.bottom, 18) }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#050505' },
  toolbar: { minHeight: 66, paddingHorizontal: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 2 },
  control: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  fileName: { flex: 1, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14, textAlign: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  zoomControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: 12 },
  hint: { color: '#B8B8B8', fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center' },
});