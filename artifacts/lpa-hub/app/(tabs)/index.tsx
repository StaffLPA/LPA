import React, { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { useListSharedCalendarEvents } from '@workspace/api-client-react';
import { eventBelongsToTeams } from '@/constants/teams';
import { LpaIcon, type LpaIconName } from '@/components/LpaIcon';

const teamColors: Record<string, string> = {
  Varsity: '#F1604D',
  'Junior Varsity': '#5B8C85',
  '14u': '#8E78B8',
  '15u': '#4D8DB8',
  'LPA Events': '#F5C85B',
};
const eventTimestamp = (date: string, time: string) => {
  const day = new Date(`${date}T12:00:00`);
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let hours = Number(match[1]);
    if (match[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (match[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
    day.setHours(hours, Number(match[2]), 0, 0);
  }
  return day.getTime();
};
const initialsFor = (fullName: string) => fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'LPA';

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role, user } = useApp();
  const calendar = useListSharedCalendarEvents(undefined, {
    query: { queryKey: ['home-calendar-events'] },
  });
  const firstName = user?.firstName?.trim() || user?.fullName.trim().split(/\s+/)[0] || 'there';
  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return (calendar.data ?? [])
      .map((event) => ({ ...event, timestamp: eventTimestamp(event.date, event.time) }))
      .filter((event) => event.timestamp >= now && (!user?.teams?.length || eventBelongsToTeams(event.team, user.teams)))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 3);
  }, [calendar.data, user?.teams]);
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Good morning, {firstName}</Text>
          </View>
           <Pressable testID="profile-button" onPress={() => router.push('/account')} style={[styles.avatar, { backgroundColor: colors.primary }]}>
             {user?.profilePhotoUri ? <Image source={{ uri: user.profilePhotoUri }} accessibilityLabel="Your profile picture" resizeMode="cover" style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initialsFor(user?.fullName ?? '')}</Text>}
          </Pressable>
        </View>

        <LinearGradient colors={['#050505', '#21150F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}><View style={styles.liveDot} /><Text style={styles.heroLabel}>LPA · {role.toUpperCase()}</Text></View>
          <Text style={styles.heroTitle}>Your team,{'\n'}in sync.</Text>
          <Text style={styles.heroCopy}>Everything your family needs for a smoother season.</Text>
           <Pressable testID="messages-shortcut" onPress={() => router.push('/(tabs)/messages')} style={styles.heroButton}><Text style={styles.heroButtonText}>Open messages</Text><LpaIcon name="arrow-up-right" size={16} color="#050505" /></Pressable>
          <View style={styles.heroAccent} />
        </LinearGradient>

         <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quick access</Text></View>
        <View style={styles.quickGrid}>
           <QuickAction icon="message-circle" label="Messages" tint="#AB562B" onPress={() => router.push('/(tabs)/messages')} colors={colors} />
          <QuickAction icon="calendar" label="Calendar" tint="#9BC7BD" onPress={() => router.push('/(tabs)/calendar')} colors={colors} />
           <QuickAction icon="file-text" label="Parent Hub" tint="#D7B56D" onPress={() => router.push('/(tabs)/parenthub')} colors={colors} />
          <QuickAction icon="users" label="Contacts" tint="#C88A62" onPress={() => router.push('/(tabs)/more')} colors={colors} />
        </View>

         <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Coming up</Text><Pressable onPress={() => router.push('/(tabs)/calendar')}><Text style={[styles.calendarLink, { color: colors.primary }]}>View calendar</Text></Pressable></View>
        <View style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {calendar.isLoading ? <View style={styles.emptyEvents}><ActivityIndicator color={colors.primary} /><Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>Syncing calendar…</Text></View> : upcomingEvents.length ? upcomingEvents.map((event, index) => {
            const eventDate = new Date(`${event.date}T12:00:00`);
            const eventColor = teamColors[event.team] ?? colors.primary;
            return <View key={event.id} style={[styles.event, index < upcomingEvents.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={[styles.dateBlock, { backgroundColor: `${eventColor}18` }]}><Text style={[styles.dateDay, { color: eventColor }]}>{eventDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</Text><Text style={[styles.dateNumber, { color: colors.foreground }]}>{eventDate.getDate()}</Text></View>
               <View style={{ flex: 1 }}><Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text><Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>{eventDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}  ·  {event.time}  ·  {event.location}</Text></View>
            </View>;
           }) : <View style={styles.emptyEvents}><LpaIcon name="calendar" size={20} color={colors.mutedForeground} /><Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>{calendar.isError ? 'Calendar could not sync.' : 'No upcoming events.'}</Text></View>}
        </View>
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, label, tint, onPress, colors }: { icon: LpaIconName; label: string; tint: string; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.quickIcon, { backgroundColor: `${tint}18` }]}><LpaIcon name={icon} size={19} color={tint} /></View><Text style={[styles.quickLabel, { color: colors.foreground }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, marginBottom: 22 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.4, marginBottom: 7 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: -0.7 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },
  hero: { marginHorizontal: 18, borderRadius: 24, padding: 22, minHeight: 190, overflow: 'hidden', marginBottom: 26 },
  heroTop: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 14 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#9BC7BD' },
  heroLabel: { color: '#D4D4CE', fontFamily: 'Inter_700Bold', letterSpacing: 1.1, fontSize: 10 },
  heroTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 34, lineHeight: 35, letterSpacing: -1.2 },
  heroCopy: { color: '#D4D4CE', fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 8, maxWidth: 230 },
  heroButton: { alignSelf: 'flex-start', flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#9BC7BD', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, marginTop: 16 },
  heroButtonText: { color: '#050505', fontFamily: 'Inter_700Bold', fontSize: 12 },
  heroAccent: { position: 'absolute', width: 150, height: 150, borderRadius: 75, right: -44, bottom: -48, borderWidth: 20, borderColor: '#AB562B77' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, marginBottom: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: -0.3 },
  calendarLink: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 18, marginBottom: 28 },
  quickAction: { width: '48.2%', minHeight: 76, borderRadius: 17, padding: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  quickIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  eventCard: { marginHorizontal: 18, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  event: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13 },
  dateBlock: { width: 48, height: 53, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 },
  dateNumber: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 24 },
  eventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 },
  eventMeta: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  emptyEvents: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 8 },
});