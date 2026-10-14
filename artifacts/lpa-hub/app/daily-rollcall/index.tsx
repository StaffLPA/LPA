import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';

const options = [
  { key: 'coach', title: 'Coach', copy: 'Daily attendance taken by coaches', icon: 'award' },
  { key: 'bus', title: 'Bus', copy: 'Daily attendance for bus riders', icon: 'map-pin' },
  { key: 'academics', title: 'Academics dashboard', copy: 'Daily attendance for academics', icon: 'book-open' },
] as const;

export default function DailyRollcallChooser() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role } = useApp();
  const allowed = role === 'Admin' || role === 'Staff-Coach';
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }]}>
      <Pressable testID="rollcall-back" accessibilityRole="button" accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'))} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="arrow-left" size={18} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>DAILY ROLLCALL</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Choose a rollcall</Text>
      {allowed ? <View style={styles.list}>
        {options.map((option) => <Pressable key={option.key} testID={`rollcall-option-${option.key}`} accessibilityRole="button" onPress={() => router.push(`/daily-rollcall/${option.key}`)} style={[styles.option, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: `${colors.primary}22` }]}><Feather name={option.icon} size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.optionTitle, { color: colors.foreground }]}>{option.title}</Text><Text style={[styles.optionCopy, { color: colors.mutedForeground }]}>{option.copy}</Text></View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>)}
      </View> : <Text testID="rollcall-denied" style={[styles.copy, { color: colors.mutedForeground }]}>Daily Rollcall is available to Admin and Staff-Coach accounts only.</Text>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  back: { width: 46, height: 46, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8, marginBottom: 20 },
  list: { gap: 11 },
  option: { minHeight: 76, borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 3 },
  optionCopy: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  copy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
});
