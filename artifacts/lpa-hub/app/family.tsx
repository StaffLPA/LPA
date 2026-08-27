// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useListLinkedAthleteCalendarEvents, useListLinkedAthletes } from '@workspace/api-client-react';
import { getCalendarTeamColor } from '@/constants/teams';

const calendarDate = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  }
  if (typeof value !== 'string') return null;
  const source = value.trim();
  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const legacy = source.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  const year = iso ? Number(iso[1]) : legacy ? Number(legacy[3].length === 2 ? `20${legacy[3]}` : legacy[3]) : null;
  const month = iso ? Number(iso[2]) : legacy ? Number(legacy[1]) : null;
  const day = iso ? Number(iso[3]) : legacy ? Number(legacy[2]) : null;
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day, 12);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
};

const eventTimestamp = (date: unknown, time: string) => {
  const day = calendarDate(date);
  if (!day) return Number.POSITIVE_INFINITY;
  const startTime = time.split(/\s+-\s+/, 1)[0];
  const match = startTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let hours = Number(match[1]);
    if (match[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (match[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
    day.setHours(hours, Number(match[2]), 0, 0);
  }
  return day.getTime();
};

const scheduleDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'numeric', day: '2-digit', year: '2-digit' });
const scheduleDateRange = (startDate: Date, endDate: Date) => startDate.getTime() === endDate.getTime()
  ? scheduleDate(startDate)
  : `${scheduleDate(startDate)} - ${scheduleDate(endDate)}`;
const calendarDayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

export default function FamilyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role, isReady, user } = useApp();
  const athletes = useListLinkedAthletes({ query: { enabled: role === 'Parent-Athlete' } });
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const selectedAthlete = useMemo(() => (athletes.data ?? []).find((athlete) => athlete.id === selectedAthleteId) ?? athletes.data?.[0] ?? null, [athletes.data, selectedAthleteId]);
  const calendar = useListLinkedAthleteCalendarEvents(selectedAthlete?.id ?? '', { query: { enabled: Boolean(selectedAthlete) && role === 'Parent-Athlete' } });

  useEffect(() => {
    if (athletes.data?.length && !athletes.data.some((athlete) => athlete.id === selectedAthleteId)) setSelectedAthleteId(athletes.data[0].id);
  }, [athletes.data, selectedAthleteId]);

  if (!isReady || !user) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  if (role !== 'Parent-Athlete') return <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top + 28 }]}><View style={[styles.deniedIcon, { backgroundColor: `${colors.primary}18` }]}><Feather name="lock" size={23} color={colors.primary} /></View><Text style={[styles.deniedTitle, { color: colors.foreground }]}>Family access is for parents</Text><Text style={[styles.deniedCopy, { color: colors.mutedForeground }]}>A linked parent or guardian account can view their athlete’s basic profile and team schedule here.</Text><Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.primary }]}><Text style={styles.backText}>Go back</Text></Pressable></View>;

  const scheduleEvents = useMemo(() => {
    const datedEvents = (calendar.data ?? [])
      .map((event) => ({ event, startDate: calendarDate(event.date) }))
      .filter((entry): entry is { event: NonNullable<(typeof calendar.data)>[number]; startDate: Date } => Boolean(entry.startDate))
      .sort((a, b) => eventTimestamp(a.event.date, a.event.time) - eventTimestamp(b.event.date, b.event.time));

    const series = [];
    const latestSeries = new Map<string, { title: string; time: string; location: string; team: string; startDate: Date; endDate: Date }>();
    for (const { event, startDate } of datedEvents) {
      const signature = [event.title, event.time, event.location, event.team].join('\u0000');
      const previous = latestSeries.get(signature);
      if (previous && calendarDayNumber(startDate) <= calendarDayNumber(previous.endDate) + 1) {
        if (startDate.getTime() > previous.endDate.getTime()) previous.endDate = startDate;
        continue;
      }
      const next = { title: event.title, time: event.time, location: event.location, team: event.team, startDate, endDate: startDate };
      latestSeries.set(signature, next);
      series.push(next);
    }
    return series;
  }, [calendar.data]);
  const initials = selectedAthlete?.fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() ?? 'LPA';
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 42 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable testID="family-back" onPress={() => router.back()} style={[styles.backIcon, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="arrow-left" size={17} color={colors.primary} /></Pressable>
          <View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR FAMILY</Text><Text style={[styles.title, { color: colors.foreground }]}>My athletes</Text></View>
        </View>
        {athletes.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : null}
        {athletes.isError ? <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="wifi-off" size={22} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Family details could not load</Text><Pressable onPress={() => athletes.refetch()}><Text style={[styles.retry, { color: colors.primary }]}>Try again</Text></Pressable></View> : null}
        {!athletes.isLoading && !athletes.isError && !athletes.data?.length ? <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="users" size={25} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No athletes linked yet</Text><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Ask an LPA Admin to link your parent or guardian account to an athlete profile.</Text></View> : null}
        {selectedAthlete ? <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.athletePills}>{athletes.data?.map((athlete) => <Pressable testID={`linked-athlete-${athlete.id}`} key={athlete.id} onPress={() => setSelectedAthleteId(athlete.id)} style={[styles.athletePill, { backgroundColor: selectedAthlete.id === athlete.id ? colors.primary : colors.card, borderColor: selectedAthlete.id === athlete.id ? colors.primary : colors.border }]}><Text style={[styles.athletePillText, { color: selectedAthlete.id === athlete.id ? '#fff' : colors.foreground }]}>{athlete.firstName || athlete.fullName}</Text></Pressable>)}</ScrollView>
          <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedAthlete.profilePhotoUri ? <Image source={{ uri: selectedAthlete.profilePhotoUri }} style={styles.profilePhoto} /> : <View style={[styles.profilePhoto, styles.initials, { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.initialsText, { color: colors.primary }]}>{initials}</Text></View>}
            <View style={{ flex: 1 }}><Text style={[styles.name, { color: colors.foreground }]}>{selectedAthlete.fullName}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{selectedAthlete.gradYear ? `Grad year · ${selectedAthlete.gradYear}` : 'Athlete'}</Text><View style={styles.teamRow}>{selectedAthlete.teams.map((team) => <View key={team} style={[styles.teamBadge, { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.teamText, { color: colors.primary }]}>{team}</Text></View>)}</View></View>
          </View>
          <View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Team schedule</Text><Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>Events for {selectedAthlete.firstName || selectedAthlete.fullName}’s teams and LPA-wide events.</Text></View><Pressable testID="refresh-linked-athlete-schedule" onPress={() => calendar.refetch()}><Feather name="refresh-cw" size={17} color={colors.primary} /></Pressable></View>
          <View style={[styles.scheduleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{calendar.isLoading ? <View style={styles.scheduleEmpty}><ActivityIndicator color={colors.primary} /><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Loading team schedule…</Text></View> : scheduleEvents.length ? scheduleEvents.map((event, index) => { const eventColor = getCalendarTeamColor(event.team); return <View key={`${event.title}-${event.time}-${event.location}-${event.startDate.toISOString()}`} style={[styles.event, { borderLeftColor: eventColor, borderLeftWidth: 4 }, index < scheduleEvents.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}><View style={[styles.dateBadge, { backgroundColor: `${eventColor}18` }]}><Text style={[styles.day, { color: eventColor }]}>{event.startDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</Text><Text style={[styles.date, { color: colors.foreground }]}>{event.startDate.getDate()}</Text></View><View style={{ flex: 1 }}><Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text><Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>{scheduleDateRange(event.startDate, event.endDate)} · {event.time} · {event.location}</Text></View></View>; }) : <View style={styles.scheduleEmpty}><Feather name="calendar" size={24} color={colors.mutedForeground} /><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{calendar.isError ? 'Schedule could not load. Try again.' : 'No team or LPA-wide events scheduled.'}</Text></View>}</View>
        </> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
   container: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, header: { paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 }, backIcon: { width: 40, height: 40, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 5 }, title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 }, athletePills: { gap: 8, paddingHorizontal: 18, paddingBottom: 16 }, athletePill: { minHeight: 40, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, justifyContent: 'center' }, athletePillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, profileCard: { marginHorizontal: 18, borderWidth: 1, borderRadius: 19, padding: 14, flexDirection: 'row', gap: 13, alignItems: 'center' }, profilePhoto: { width: 60, height: 60, borderRadius: 18 }, initials: { alignItems: 'center', justifyContent: 'center' }, initialsText: { fontFamily: 'Inter_700Bold', fontSize: 16 }, name: { fontFamily: 'Inter_700Bold', fontSize: 17 }, meta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, teamRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }, teamBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 }, teamText: { fontFamily: 'Inter_700Bold', fontSize: 9 }, sectionHeader: { marginHorizontal: 22, marginTop: 25, marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 }, sectionCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4, maxWidth: 285 }, scheduleCard: { marginHorizontal: 18, borderWidth: 1, borderRadius: 18, overflow: 'hidden' }, scheduleEmpty: { minHeight: 116, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 25 }, event: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 12 }, dateBadge: { width: 48, height: 53, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, day: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 }, date: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 24 }, eventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, eventMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 }, empty: { marginHorizontal: 18, borderWidth: 1, borderRadius: 19, minHeight: 180, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 9 }, emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, textAlign: 'center' }, emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', lineHeight: 18 }, retry: { fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 6 }, deniedIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, deniedTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center' }, deniedCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 }, back: { minHeight: 46, marginTop: 20, paddingHorizontal: 19, borderRadius: 14, justifyContent: 'center' }, backText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },
});