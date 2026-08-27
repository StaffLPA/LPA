import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [images, setImages] = useState<Record<string, { uri: string; width?: number; height?: number }>>({});
  useEffect(() => { void customFetch<Record<string, { uri: string; width?: number; height?: number }>>('/api/schedule-images', { responseType: 'json' }).then(setImages).catch(() => undefined); }, []);
  const schedule = images['weekly-schedule'];
  const lunch = images['lunch-program'];
  const scheduleRatio = schedule?.width && schedule?.height ? schedule.width / schedule.height : 1600 / 2024;
  const lunchRatio = lunch?.width && lunch?.height ? lunch.width / lunch.height : 1024 / 768;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: 112 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>LPA SCHEDULE</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Schedule</Text>
          </View>
        </View>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          This week’s training and classroom schedule for LPA athletes.
        </Text>
        <View style={[styles.scheduleCard, { borderColor: colors.border, backgroundColor: '#000' }]}>
          <Image
            source={schedule ? { uri: schedule.uri } : require('../../assets/lpa-schedule-week-of-0817.png')}
            accessibilityLabel="LPA Schedule for August 17 through August 23"
            resizeMode="contain"
            style={[styles.scheduleImage, { aspectRatio: scheduleRatio }]}
          />
        </View>
        <View style={styles.lunchHeader}>
          <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>DAILY LUNCH PROGRAM</Text>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Student Athlete Lunch</Text>
          <Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>
            Fresh daily meals prepared for LPA student athletes.
          </Text>
        </View>
        <View style={[styles.scheduleCard, styles.lunchCard, { borderColor: colors.border, backgroundColor: '#000' }]}>
          <Image
            source={lunch ? { uri: lunch.uri } : require('../../assets/lpa-student-athlete-lunch-program.png')}
            accessibilityLabel="LPA Daily Student Athlete Lunch Program for August 10 through September 4, 2026"
            resizeMode="contain"
            style={[styles.scheduleImage, { aspectRatio: lunchRatio }]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18 },
  header: { paddingHorizontal: 4, marginBottom: 14 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 },
  intro: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginHorizontal: 4, marginBottom: 20, maxWidth: 320 },
  scheduleCard: { borderWidth: 1, borderRadius: 17, overflow: 'hidden', alignSelf: 'center', width: '100%', maxWidth: 680 },
  scheduleImage: { width: '100%' },
  lunchHeader: { marginHorizontal: 4, marginTop: 24, marginBottom: 12 },
  sectionEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 5 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, letterSpacing: -0.4, marginBottom: 4 },
  sectionCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  lunchCard: { marginBottom: 8 },
});