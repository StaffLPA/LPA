import React, { ReactNode } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { webMax } from './ui';

export function Shell({ title, kicker = 'LPA METRICS', children, onRefresh, refreshing, right }: { title: string; kicker?: string; children: ReactNode; onRefresh?: () => void; refreshing?: boolean; right?: ReactNode }) {
  const c = useColors(); const insets = useSafeAreaInsets(); const router = useRouter();
  return <View style={{ flex: 1, backgroundColor: c.background }}>
    <ScrollView refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} /> : undefined} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: (Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top) + 14, paddingBottom: Math.max(insets.bottom, 34) + 40 }}>
      <View style={webMax}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Pressable testID="metrics-back" accessibilityRole="button" accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card, borderColor: c.border }}><Feather name="arrow-left" size={17} color={c.primary} /></Pressable>
          <View style={{ flex: 1 }}><Text style={{ color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3 }}>{kicker}</Text><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: -0.6 }}>{title}</Text></View>
          {right}
        </View>
        {children}
      </View>
    </ScrollView>
  </View>;
}
