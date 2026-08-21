import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { useCreateCalendarEvent, useGetCalendarFeed } from '@workspace/api-client-react';

type ViewMode = 'Week' | 'Month';
type CalendarTeam = 'All Teams' | 'Varsity' | 'Junior Varsity' | '14u' | '15u' | 'LPA Events';
type CalendarEvent = { id: string; date: string; time: string; endTime?: string; title: string; location: string; tag: string; team: CalendarTeam; tint: string };

const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const teams: { name: CalendarTeam; color: string }[] = [
  { name: 'All Teams', color: '#AB562B' },
  { name: 'Varsity', color: '#F1604D' },
  { name: 'Junior Varsity', color: '#5B8C85' },
  { name: '14u', color: '#8E78B8' },
  { name: '15u', color: '#4D8DB8' },
  { name: 'LPA Events', color: '#F5C85B' },
];
const feedSlugs = {
  Varsity: 'varsity',
  'Junior Varsity': 'lpa-jv',
  '14u': '14u',
  '15u': '15u',
  'LPA Events': 'lpa-events',
} as const;
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateFromKey = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};
const weekDatesFor = (date: string) => {
  const start = dateFromKey(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return localDateKey(day);
  });
};
const formatIcsTime = (value: string | undefined) => {
  const match = value?.match(/T(\d{2})(\d{2})/);
  if (!match) return 'Time TBD';
  const hours = Number(match[1]);
  const minutes = match[2];
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
};
const unescapeIcs = (value: string) => value.replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1');
function parseIcsEvents(feed: string | undefined, team: Exclude<CalendarTeam, 'All Teams'>, tint: string): CalendarEvent[] {
  if (!feed) return [];
  const events: CalendarEvent[] = [];
  let values: Record<string, string> | null = null;
  for (const line of feed.replace(/\r\n[ \t]/g, '').split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') { values = {}; continue; }
    if (line === 'END:VEVENT' && values) {
      const startsAt = values.DTSTART;
      const date = startsAt?.match(/^(\d{4})(\d{2})(\d{2})/)?.slice(1).join('-');
      if (date && values.UID && values.SUMMARY) events.push({
        id: values.UID.replace(/@lpahub$/, ''),
        date,
        time: formatIcsTime(startsAt),
        endTime: formatIcsTime(values.DTEND),
        title: unescapeIcs(values.SUMMARY),
        location: unescapeIcs(values.LOCATION ?? 'LPA Campus'),
        tag: team.toUpperCase(),
        team,
        tint,
      });
      values = null;
      continue;
    }
    if (!values) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).split(';', 1)[0];
    values[key] = line.slice(separator + 1);
  }
  return events;
}

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { role } = useApp();
  const isAdmin = role === 'Admin';
  const today = new Date();
  const [monthDate, setMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(localDateKey(today));
  const [view, setView] = useState<ViewMode>('Week');
  const [selectedTeam, setSelectedTeam] = useState<CalendarTeam>('All Teams');
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [isCalendarFocused, setIsCalendarFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setIsCalendarFocused(true);
    return () => setIsCalendarFocused(false);
  }, []));
  const feedOptions = (team: string) => ({
    query: { queryKey: ['/api/calendar.ics', { team }], enabled: isCalendarFocused },
    // Keep browser preview requests cache-free and credential-capable.
    request: { cache: 'no-store' as RequestCache, credentials: 'include' as RequestCredentials },
  });
  const varsityFeed = useGetCalendarFeed({ team: feedSlugs.Varsity }, feedOptions(feedSlugs.Varsity));
  const juniorVarsityFeed = useGetCalendarFeed({ team: feedSlugs['Junior Varsity'] }, feedOptions(feedSlugs['Junior Varsity']));
  const fourteenUFeed = useGetCalendarFeed({ team: feedSlugs['14u'] }, feedOptions(feedSlugs['14u']));
  const fifteenUFeed = useGetCalendarFeed({ team: feedSlugs['15u'] }, feedOptions(feedSlugs['15u']));
  const lpaEventsFeed = useGetCalendarFeed({ team: feedSlugs['LPA Events'] }, feedOptions(feedSlugs['LPA Events']));
  const feeds = [
    { team: 'Varsity' as const, feed: varsityFeed, tint: '#F1604D' },
    { team: 'Junior Varsity' as const, feed: juniorVarsityFeed, tint: '#5B8C85' },
    { team: '14u' as const, feed: fourteenUFeed, tint: '#8E78B8' },
    { team: '15u' as const, feed: fifteenUFeed, tint: '#4D8DB8' },
    { team: 'LPA Events' as const, feed: lpaEventsFeed, tint: '#F5C85B' },
  ];
  const refreshCalendarFeeds = () => Promise.all(feeds.map(({ feed }) => feed.refetch()));
  const createPersistedEvent = useCreateCalendarEvent({ mutation: { onSuccess: () => { void refreshCalendarFeeds(); setTitle(''); setTime(''); setEndTime(''); setLocation(''); setShowCreate(false); } } });
  const events = useMemo(() => {
    return feeds.flatMap(({ team, feed, tint }) => parseIcsEvents(feed.data, team, tint));
  }, [fifteenUFeed.data, fourteenUFeed.data, juniorVarsityFeed.data, lpaEventsFeed.data, varsityFeed.data]);
  const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
  const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leading = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();
  const cells = Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => index - leading + 1);
  const filteredEvents = useMemo(() => selectedTeam === 'All Teams' ? events : events.filter((event) => event.team === selectedTeam), [events, selectedTeam]);
  const selectedEvents = useMemo(() => filteredEvents.filter((event) => event.date === selectedDate), [filteredEvents, selectedDate]);
  const selectedLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const moveMonth = (amount: number) => {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + amount, 1);
    setMonthDate(next);
    setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`);
  };
  const chooseDay = (day: number) => setSelectedDate(`${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  const chooseDate = (date: string) => {
    const next = dateFromKey(date);
    setSelectedDate(date);
    setMonthDate(new Date(next.getFullYear(), next.getMonth(), 1));
  };
  const moveWeek = (amount: number) => {
    const next = dateFromKey(selectedDate);
    next.setDate(next.getDate() + amount * 7);
    chooseDate(localDateKey(next));
  };
  const createEvent = () => {
    if (!title.trim() || !time.trim()) return;
    createPersistedEvent.mutate({ data: { title, date: selectedDate, time: endTime.trim() ? `${time.trim()} - ${endTime.trim()}` : time.trim(), location: location || 'LPA Campus', team: 'LPA Events' } }, { onError: (error) => Alert.alert('Could not add event', error.message) });
  };

  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 115 }} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>{monthLabel.toUpperCase()}</Text><Text style={[styles.title, { color: colors.foreground }]}>Calendar</Text></View>{isAdmin ? <Pressable testID="create-event" onPress={() => setShowCreate(true)} style={[styles.add, { backgroundColor: colors.primary }]}><Feather name="plus" size={19} color="#fff" /></Pressable> : null}</View>
      <View style={styles.filterWrap}><Pressable testID="calendar-team-filter" onPress={() => setShowTeamMenu((visible) => !visible)} style={[styles.filterSelect, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.filterDot, { backgroundColor: teams.find((team) => team.name === selectedTeam)?.color ?? colors.primary }]} /><Text style={[styles.filterText, { color: colors.foreground }]}>{selectedTeam}</Text><Feather name={showTeamMenu ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} /></Pressable>{showTeamMenu ? <View style={[styles.filterMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>{teams.map((team) => <Pressable key={team.name} testID={`calendar-filter-${team.name}`} onPress={() => { setSelectedTeam(team.name); setShowTeamMenu(false); }} style={styles.filterOption}><View style={[styles.filterDot, { backgroundColor: team.color }]} /><Text style={[styles.filterText, { color: colors.foreground, flex: 1 }]}>{team.name}</Text>{selectedTeam === team.name ? <Feather name="check" size={16} color={colors.primary} /> : null}</Pressable>)}</View> : null}</View>
      <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
         <View style={styles.monthRow}><Text style={[styles.month, { color: colors.foreground }]}>{monthLabel}</Text><View style={styles.arrows}><Pressable testID={view === 'Week' ? 'previous-week' : 'previous-month'} accessibilityLabel={view === 'Week' ? 'Previous week' : 'Previous month'} onPress={() => view === 'Week' ? moveWeek(-1) : moveMonth(-1)} hitSlop={10}><Feather name="chevron-left" size={19} color={colors.foreground} /></Pressable><Pressable testID={view === 'Week' ? 'next-week' : 'next-month'} accessibilityLabel={view === 'Week' ? 'Next week' : 'Next month'} onPress={() => view === 'Week' ? moveWeek(1) : moveMonth(1)} hitSlop={10}><Feather name="chevron-right" size={19} color={colors.foreground} /></Pressable></View></View>
        <View style={styles.weekRow}>{weekdays.map((day, index) => <Text key={`${day}-${index}`} style={[styles.weekday, { color: colors.mutedForeground }]}>{day}</Text>)}</View>
          {view === 'Month' ? <View style={styles.monthGrid}>{cells.map((day, index) => { const date = day > 0 && day <= days ? `${monthKey}-${String(day).padStart(2, '0')}` : ''; const hasEvent = date !== '' && filteredEvents.some((event) => event.date === date); return <Pressable key={`${monthKey}-${index}`} disabled={!date} onPress={() => chooseDay(day)} style={styles.monthCell}><View style={[styles.monthDate, date === selectedDate && { backgroundColor: colors.primary }]}><Text style={[styles.monthDateText, { color: date === selectedDate ? '#fff' : date ? colors.foreground : colors.muted }]}>{date ? day : ''}</Text></View><View style={[styles.dot, { backgroundColor: hasEvent ? colors.primary : 'transparent' }]} /></Pressable>; })}</View> : <View style={styles.weekRow}>{weekDatesFor(selectedDate).map((date) => { const day = dateFromKey(date).getDate(); return <Pressable key={date} onPress={() => chooseDate(date)} style={styles.dayCell}><View style={[styles.dateCircle, selectedDate === date && { backgroundColor: colors.primary }]}><Text style={[styles.dateText, { color: selectedDate === date ? '#fff' : colors.foreground }]}>{day}</Text></View><View style={[styles.dot, { backgroundColor: filteredEvents.some((event) => event.date === date) ? colors.primary : 'transparent' }]} /></Pressable>; })}</View>}
      </View>
      <View style={[styles.segment, { backgroundColor: colors.muted }]}>{(['Week', 'Month'] as ViewMode[]).map((item) => <Pressable key={item} onPress={() => setView(item)} style={[styles.segmentButton, view === item && { backgroundColor: colors.card }]}><Text style={[styles.segmentText, { color: view === item ? colors.foreground : colors.mutedForeground }]}>{item}</Text></Pressable>)}</View>
      <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{selectedLabel}</Text><Text style={[styles.count, { color: colors.mutedForeground }]}>{selectedEvents.length} events</Text></View>
      {view === 'Week' ? <WeekOverview colors={colors} events={filteredEvents} selectedDate={selectedDate} /> : <View style={[styles.agendaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{selectedEvents.length ? selectedEvents.map((item) => <EventRow key={item.id} item={item} colors={colors} />) : <View style={styles.empty}><Feather name="calendar" size={25} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No events scheduled</Text></View>}</View>}
    </ScrollView>
    <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.card }]}><View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Create event</Text><Pressable onPress={() => setShowCreate(false)}><Feather name="x" size={20} color={colors.mutedForeground} /></Pressable></View><Text style={[styles.modalDate, { color: colors.mutedForeground }]}>{selectedLabel}</Text><TextInput value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /><View style={styles.timeInputs}><TextInput value={time} onChangeText={setTime} placeholder="Start (4:00 PM)" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.halfInput, { color: colors.foreground, borderColor: colors.border }]} /><TextInput value={endTime} onChangeText={setEndTime} placeholder="End (12:00 PM)" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.halfInput, { color: colors.foreground, borderColor: colors.border }]} /></View><TextInput value={location} onChangeText={setLocation} placeholder="Location (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /><Pressable testID="save-event" onPress={createEvent} disabled={!title.trim() || !time.trim() || createPersistedEvent.isPending} style={[styles.save, { backgroundColor: title.trim() && time.trim() ? colors.primary : colors.muted }]}><Text style={styles.saveText}>{createPersistedEvent.isPending ? 'Adding…' : 'Add event'}</Text></Pressable></View></View></Modal>
  </View>;
}

function EventRow({ item, colors }: { item: CalendarEvent; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.eventRow}><Text style={[styles.eventTime, { color: colors.mutedForeground }]}>{item.endTime && item.endTime !== 'Time TBD' ? `${item.time}\n– ${item.endTime}` : item.time}</Text><View style={[styles.eventBar, { backgroundColor: item.tint }]} /><View style={{ flex: 1 }}><Text style={[styles.eventTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.eventLocation, { color: colors.mutedForeground }]}><Feather name="map-pin" size={11} color={colors.mutedForeground} /> {item.location}</Text></View><Text style={[styles.tag, { color: item.tint, backgroundColor: `${item.tint}18` }]}>{item.tag}</Text></View>;
}

function WeekOverview({ colors, events, selectedDate }: { colors: ReturnType<typeof useColors>; events: CalendarEvent[]; selectedDate: string }) {
  return <View style={[styles.weekOverview, { backgroundColor: colors.card, borderColor: colors.border }]}>{weekDatesFor(selectedDate).map((date, index) => { const day = dateFromKey(date); const count = events.filter((event) => event.date === date).length; return <View key={date} style={[styles.weekLine, index < 6 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}><View style={[styles.weekNumber, { backgroundColor: date === selectedDate ? colors.primary : colors.muted }]}><Text style={[styles.weekNumberText, { color: date === selectedDate ? '#fff' : colors.foreground }]}>{day.getDate()}</Text></View><View><Text style={[styles.weekTitle, { color: colors.foreground }]}>{count ? `${count} event${count > 1 ? 's' : ''}` : 'No events'}</Text><Text style={[styles.weekMeta, { color: colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short', month: 'short' })}</Text></View></View>; })}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { paddingHorizontal: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 6 }, title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 }, add: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, filterWrap: { marginHorizontal: 18, marginBottom: 14, zIndex: 5 }, filterSelect: { minHeight: 45, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, filterMenu: { position: 'absolute', top: 51, left: 0, right: 0, borderWidth: 1, borderRadius: 14, paddingVertical: 5, zIndex: 10, elevation: 6 }, filterOption: { minHeight: 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, filterDot: { width: 8, height: 8, borderRadius: 4 }, filterText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, calendarCard: { marginHorizontal: 18, borderRadius: 19, borderWidth: 1, padding: 16 }, monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, month: { fontFamily: 'Inter_700Bold', fontSize: 15 }, arrows: { flexDirection: 'row', gap: 18 }, weekRow: { flexDirection: 'row', justifyContent: 'space-between' }, weekday: { fontFamily: 'Inter_600SemiBold', fontSize: 10, width: 32, textAlign: 'center' }, dayCell: { alignItems: 'center', gap: 5, width: 32 }, dateCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, dateText: { fontFamily: 'Inter_700Bold', fontSize: 13 }, monthGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }, monthCell: { width: '14.2857%', height: 49, alignItems: 'center', gap: 3 }, monthDate: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, monthDateText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, dot: { width: 4, height: 4, borderRadius: 2 }, segment: { marginHorizontal: 18, marginTop: 18, borderRadius: 14, padding: 3, flexDirection: 'row' }, segmentButton: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 11 }, segmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, sectionRow: { marginHorizontal: 22, marginTop: 25, marginBottom: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 }, count: { fontFamily: 'Inter_400Regular', fontSize: 11 }, agendaCard: { marginHorizontal: 18, borderWidth: 1, borderRadius: 18, overflow: 'hidden' }, eventRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: '#D9DED9' }, eventTime: { fontFamily: 'Inter_500Medium', width: 58, fontSize: 10, lineHeight: 14 }, eventBar: { width: 3, height: 38, borderRadius: 2 }, eventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 5 }, eventLocation: { fontFamily: 'Inter_400Regular', fontSize: 11 }, tag: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.5, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 }, empty: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 8 }, emptyText: { fontFamily: 'Inter_500Medium', fontSize: 12 }, weekOverview: { marginHorizontal: 18, borderWidth: 1, borderRadius: 18, overflow: 'hidden' }, weekLine: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 58, paddingHorizontal: 14 }, weekNumber: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, weekNumberText: { fontFamily: 'Inter_700Bold', fontSize: 13 }, weekTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, weekMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }, backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 35 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }, modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 22 }, modalDate: { fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 16 }, input: { height: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 9 }, timeInputs: { flexDirection: 'row', gap: 8 }, halfInput: { flex: 1 }, save: { height: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 6 }, saveText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },
});