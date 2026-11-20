import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { LpaIcon as Icon } from '@/components/LpaIcon';
import { IntensityGuideContent } from '@/components/workouts/IntensityGuide';

export default function IntensityGuidePage() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? 67 : insets.top + 12;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom + 16;
  return <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: 16, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
    <Pressable testID="intensity-guide-back" accessibilityRole="button" accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={st.back}>
      <Icon name="chevron-left" size={18} color={c.accent} /><Text style={[st.backText, { color: c.accent }]}>Back</Text>
    </Pressable>
    <Text style={[st.kicker, { color: c.accent }]}>LPA HUB / BUILD</Text>
    <Text accessibilityRole="header" style={[st.h, { color: c.foreground }]}>Intensity Guide</Text>
    <Text style={[st.sub, { color: c.mutedForeground }]}>Percentages plan the work. RPE and RIR tell you how today really felt.</Text>
    <View style={{ height: 14 }} />
    <IntensityGuideContent />
  </ScrollView>;
}

const st = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 12, alignSelf: 'flex-start' },
  backText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3 },
  h: { fontFamily: 'Inter_700Bold', fontSize: 28, marginTop: 4, letterSpacing: -0.5 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 6, lineHeight: 20 },
});
