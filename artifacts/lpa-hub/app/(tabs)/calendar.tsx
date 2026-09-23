import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useGetCalendarFeed } from '@workspace/api-client-react';
import { useTagCatalog } from '@/hooks/useTagCatalog';
import { canonicalTeam, getTeamColor, tagLabel, type TagCatalog } from '@/constants/tagCatalog';

type ViewMode = 'Week' | 'Month';
type CalendarEvent = { id: string; date: string; endDate?: string; time: string; endTime?: string; title: string; location: string; tag: string; team: string; tint: string };

const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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
const eventColorsForDate = (events: CalendarEvent[], date: string) => Array.from(new Set(events.filter((event) => event.date === date).map((event) => event.tint)));
const eventTimestamp = (date: string, time: string) => {
  const day = dateFromKey(date);
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let hours = Number(match[1]);
    if (match[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (match[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
    day.setHours(hours, Number(match[2]), 0, 0);
  }
  return day.getTime();
};
const dateRangeLabel = (startDate: string, endDate = startDate) => {
  const start = dateFromKey(startDate);
  const end = dateFromKey(endDate);
  if (startDate === endDate) return start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
};
const timeRangeLabel = (event: CalendarEvent) => event.endTime && event.endTime !== 'Time TBD' && event.endTime !== event.time
  ? `${event.time} – ${event.endTime}`
  : event.time;
const formatIcsTime = (value: string | undefined) => {
  const match = value?.match(/T(\d{2})(\d{2})/);
  if (!match) return 'Time TBD';
  const hours = Number(match[1]);
  const minutes = match[2];
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
};
const unescapeIcs = (value: string) => value.replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1');
function parseIcsEvents(feed: string | undefined, catalog: TagCatalog, fallbackTeam = ''): CalendarEvent[] {
  if (!feed) return [];
  const events: CalendarEvent[] = [];
  let values: Record<string, string> | null = null;
  for (const line of feed.replace(/\r\n[ \t]/g, '').split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') { values = {}; continue; }
    if (line === 'END:VEVENT' && values) {
      const startsAt = values.DTSTART;
      const date = startsAt?.match(/^(\d{4})(\d{2})(\d{2})/)?.slice(1).join('-');
      const endDate = values.DTEND?.match(/^(\d{4})(\d{2})(\d{2})/)?.slice(1).join('-');
      const rawTeam = values['X-LPA-TEAM'] ?? values.CATEGORIES ?? fallbackTeam;
      const team = canonicalTeam(catalog, unescapeIcs(rawTeam));
      if (date && values.UID && values.SUMMARY) events.push({
        id: values.UID.replace(/@lpahub$/, ''),
        date,
        endDate: endDate && endDate !== date ? endDate : undefined,
        time: formatIcsTime(startsAt),
        endTime: formatIcsTime(values.DTEND),
        title: unescapeIcs(values.SUMMARY),
        location: unescapeIcs(values.LOCATION ?? 'LPA Campus'),
        tag: tagLabel(catalog, 'teams', team),
        team,
        tint: getTeamColor(catalog, team),
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
  const today = new Date();
  const [monthDate, setMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(localDateKey(today));
  const [weekDayFilter, setWeekDayFilter] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('Week');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  const [isCalendarFocused, setIsCalendarFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setIsCalendarFocused(true);
    return () => setIsCalendarFocused(false);
  }, []));
  const catalogQuery = useTagCatalog();
  const catalog = catalogQuery.data;
  const teamOptions = useMemo(() => [{ id: 'all', label: 'All Teams' }, ...((catalog?.teams ?? []) as Array<{ id: string; label: string }>)], [catalog?.teams]);
  const feedRequest = { cache: 'no-store' as RequestCache, credentials: 'include' as RequestCredentials, responseType: 'text' as const };
  const feedOptions = (team: string) => ({
    query: { queryKey: ['/api/calendar.ics', { team }], enabled: isCalendarFocused },
    request: feedRequest,
  });
  const calendarFeed = useGetCalendarFeed({ team: 'all' }, feedOptions('all'));
  const varsityFeed = useGetCalendarFeed({ team: 'varsity' }, feedOptions('varsity'));
  const juniorVarsityFeed = useGetCalendarFeed({ team: 'lpa-jv' }, feedOptions('lpa-jv'));
  const fourteenFeed = useGetCalendarFeed({ team: '14u' }, feedOptions('14u'));
  const fifteenFeed = useGetCalendarFeed({ team: '15u' }, feedOptions('15u'));
  const lpaFeed = useGetCalendarFeed({ team: 'lpa-events' }, feedOptions('lpa-events'));
  const events = useMemo(() => {
    const merged = new Map<string, CalendarEvent>();
    for (const [feed, team] of [
      [varsityFeed.data, 'LPA Varsity'],
      [juniorVarsityFeed.data, 'LPA JV'],
      [fourteenFeed.data, 'LPA 14U'],
      [fifteenFeed.data, 'LPA 15U'],
      [lpaFeed.data, 'LPA'],
      [calendarFeed.data, ''],
    ] as const) {
      for (const event of parseIcsEvents(feed, catalog, team)) merged.set(event.id, event);
    }
    return [...merged.values()];
  }, [calendarFeed.data, varsityFeed.data, juniorVarsityFeed.data, fourteenFeed.data, fifteenFeed.data, lpaFeed.data, catalog]);
  const feedsUnavailable = calendarFeed.isError && varsityFeed.isError && juniorVarsityFeed.isError && fourteenFeed.isError && fifteenFeed.isError && lpaFeed.isError;
  const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
  const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leading = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();
  const cells = Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => index - leading + 1);
  const filteredEvents = useMemo(() => selectedTeam === 'all' ? events : events.filter((event) => canonicalTeam(catalog, event.team) === selectedTeam), [events, selectedTeam, catalog]);
  const selectedEvents = useMemo(() => filteredEvents.filter((event) => event.date === selectedDate), [filteredEvents, selectedDate]);
  const selectedWeek = useMemo(() => weekDatesFor(selectedDate), [selectedDate]);
  const weekEvents = useMemo(() => {
    const [weekStart, weekEnd] = [selectedWeek[0], selectedWeek[selectedWeek.length - 1]];
    return filteredEvents
      .filter((event) => {
        const eventEndDate = event.endDate ?? event.date;
        return event.date <= weekEnd && eventEndDate >= weekStart;
      })
      .sort((a, b) => eventTimestamp(a.date, a.time) - eventTimestamp(b.date, b.time));
  }, [filteredEvents, selectedWeek]);
  const visibleWeekEvents = useMemo(() => weekDayFilter
    ? weekEvents.filter((event) => event.date <= weekDayFilter && (event.endDate ?? event.date) >= weekDayFilter)
    : weekEvents, [weekEvents, weekDayFilter]);
  const selectedLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const selectedWeekLabel = dateRangeLabel(selectedWeek[0], selectedWeek[selectedWeek.length - 1]);

  const moveMonth = (amount: number) => {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + amount, 1);
    setMonthDate(next);
    setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`);
    setWeekDayFilter(null);
  };
  const chooseDay = (day: number) => {
    setSelectedDate(`${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    setWeekDayFilter(null);
  };
  const chooseDate = (date: string) => {
    const next = dateFromKey(date);
    setSelectedDate(date);
    setMonthDate(new Date(next.getFullYear(), next.getMonth(), 1));
  };
  const chooseWeekDay = (date: string) => {
    chooseDate(date);
    setWeekDayFilter((current) => current === date ? null : date);
  };
  const moveWeek = (amount: number) => {
    const next = dateFromKey(selectedDate);
    next.setDate(next.getDate() + amount * 7);
    chooseDate(localDateKey(next));
    setWeekDayFilter(null);
  };
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 115 }} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>{monthLabel.toUpperCase()}</Text><Text style={[styles.title, { color: colors.foreground }]}>Calendar</Text></View></View>
       <View style={styles.filterWrap}><Pressable testID="calendar-team-filter" onPress={() => setShowTeamMenu((visible) => !visible)} style={[styles.filterSelect, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.filterDot, { backgroundColor: selectedTeam === 'all' ? colors.primary : getTeamColor(catalog, selectedTeam) }]} /><Text style={[styles.filterText, { color: colors.foreground }]}>{teamOptions.find((team) => team.id === selectedTeam)?.label ?? selectedTeam}</Text><Feather name={showTeamMenu ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} /></Pressable>{showTeamMenu ? <View style={[styles.filterMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>{teamOptions.map((team) => <Pressable key={team.id} testID={`calendar-filter-${team.id}`} onPress={() => { setSelectedTeam(team.id); setShowTeamMenu(false); }} style={styles.filterOption}><View style={[styles.filterDot, { backgroundColor: team.id === 'all' ? colors.primary : getTeamColor(catalog, team.id) }]} /><Text style={[styles.filterText, { color: colors.foreground, flex: 1 }]}>{team.label}</Text>{selectedTeam === team.id ? <Feather name="check" size={16} color={colors.primary} /> : null}</Pressable>)}</View> : null}</View>
      <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
         <View style={styles.monthRow}><Text style={[styles.month, { color: colors.foreground }]}>{monthLabel}</Text><View style={styles.arrows}><Pressable testID={view === 'Week' ? 'previous-week' : 'previous-month'} accessibilityLabel={view === 'Week' ? 'Previous week' : 'Previous month'} onPress={() => view === 'Week' ? moveWeek(-1) : moveMonth(-1)} hitSlop={10}><Feather name="chevron-left" size={19} color={colors.foreground} /></Pressable><Pressable testID={view === 'Week' ? 'next-week' : 'next-month'} accessibilityLabel={view === 'Week' ? 'Next week' : 'Next month'} onPress={() => view === 'Week' ? moveWeek(1) : moveMonth(1)} hitSlop={10}><Feather name="chevron-right" size={19} color={colors.foreground} /></Pressable></View></View>
        <View style={styles.weekRow}>{weekdays.map((day, index) => <Text key={`${day}-${index}`} style={[styles.weekday, { color: colors.mutedForeground }]}>{day}</Text>)}</View>
           {view === 'Month' ? <View style={styles.monthGrid}>{cells.map((day, index) => { const date = day > 0 && day <= days ? `${monthKey}-${String(day).padStart(2, '0')}` : ''; const eventColors = date ? eventColorsForDate(filteredEvents, date) : []; return <Pressable key={`${monthKey}-${index}`} disabled={!date} onPress={() => chooseDay(day)} style={styles.monthCell}><View style={[styles.monthDate, date === selectedDate && { backgroundColor: colors.primary }]}><Text style={[styles.monthDateText, { color: date === selectedDate ? '#fff' : date ? colors.foreground : colors.muted }]}>{date ? day : ''}</Text></View><ColorDots colors={eventColors} /></Pressable>; })}</View> : <View style={styles.weekRow}>{selectedWeek.map((date) => { const day = dateFromKey(date).getDate(); const isFiltered = weekDayFilter === date; return <Pressable key={date} testID={`calendar-week-day-${date}`} accessibilityRole="button" accessibilityLabel={dateFromKey(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} accessibilityState={{ selected: isFiltered }} onPress={() => chooseWeekDay(date)} style={styles.dayCell}><View style={[styles.dateCircle, isFiltered && { backgroundColor: colors.primary }]}><Text style={[styles.dateText, { color: isFiltered ? '#fff' : colors.foreground }]}>{day}</Text></View><ColorDots colors={eventColorsForDate(filteredEvents, date)} /></Pressable>; })}</View>}
      </View>
       <View style={[styles.segment, { backgroundColor: colors.muted }]}>{(['Week', 'Month'] as ViewMode[]).map((item) => <Pressable key={item} onPress={() => { setView(item); if (item === 'Week') setWeekDayFilter(null); }} style={[styles.segmentButton, view === item && { backgroundColor: colors.card }]}><Text style={[styles.segmentText, { color: view === item ? colors.foreground : colors.mutedForeground }]}>{item}</Text></Pressable>)}</View>
       <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{view === 'Week' ? weekDayFilter ? selectedLabel : selectedWeekLabel : selectedLabel}</Text><Text style={[styles.count, { color: colors.mutedForeground }]}>{view === 'Week' ? `${visibleWeekEvents.length} events` : `${selectedEvents.length} events`}</Text></View>
        {view === 'Week' ? <WeekEvents colors={colors} events={visibleWeekEvents} emptyMessage={feedsUnavailable ? 'Calendar could not sync' : weekDayFilter ? 'No events scheduled for this day' : 'No events scheduled this week'} /> : <View style={[styles.agendaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{selectedEvents.length ? selectedEvents.map((item) => <EventRow key={item.id} item={item} colors={colors} />) : <View style={styles.empty}><Feather name="calendar" size={25} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{feedsUnavailable ? 'Calendar could not sync' : 'No events scheduled'}</Text></View>}</View>}
    </ScrollView>
  </View>;
}

function EventRow({ item, colors }: { item: CalendarEvent; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.eventRow}><Text style={[styles.eventTime, { color: colors.mutedForeground }]}>{item.endTime && item.endTime !== 'Time TBD' ? `${item.time}\n– ${item.endTime}` : item.time}</Text><View style={[styles.eventBar, { backgroundColor: item.tint }]} /><View style={{ flex: 1 }}><Text style={[styles.eventTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.eventLocation, { color: colors.mutedForeground }]}><Feather name="map-pin" size={11} color={colors.mutedForeground} /> {item.location}</Text></View><Text style={[styles.tag, { color: item.tint, backgroundColor: `${item.tint}18` }]}>{item.tag}</Text></View>;
}

function WeekEvents({ colors, events, emptyMessage }: { colors: ReturnType<typeof useColors>; events: CalendarEvent[]; emptyMessage: string }) {
  return <View style={[styles.weekEventsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
    {events.length ? events.map((item, index) => {
      const eventDate = dateFromKey(item.date);
      const eventColor = item.tint;
      return <View key={item.id} style={[styles.weekEvent, index < events.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <View style={[styles.weekDateBlock, { backgroundColor: `${eventColor}18` }]}>
          <Text style={[styles.weekDateDay, { color: eventColor }]}>{eventDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</Text>
          <Text style={[styles.weekDateNumber, { color: colors.foreground }]}>{eventDate.getDate()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.weekEventTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.weekEventMeta, { color: colors.mutedForeground }]} numberOfLines={2}>{dateRangeLabel(item.date, item.endDate)} · {timeRangeLabel(item)} · {item.location}</Text>
        </View>
      </View>;
    }) : <View style={styles.empty}><Feather name="calendar" size={25} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{emptyMessage}</Text></View>}
  </View>;
}

function ColorDots({ colors }: { colors: string[] }) {
  return <View style={{ height: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>{colors.map((color, index) => <View key={`${color}-${index}`} style={[styles.dot, { backgroundColor: color }]} />)}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { paddingHorizontal: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 6 }, title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 }, add: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, filterWrap: { marginHorizontal: 18, marginBottom: 14, zIndex: 5 }, filterSelect: { minHeight: 45, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, filterMenu: { position: 'absolute', top: 51, left: 0, right: 0, borderWidth: 1, borderRadius: 14, paddingVertical: 5, zIndex: 10, elevation: 6 }, filterOption: { minHeight: 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, filterDot: { width: 8, height: 8, borderRadius: 4 }, filterText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, calendarCard: { marginHorizontal: 18, borderRadius: 19, borderWidth: 1, padding: 16 }, monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, month: { fontFamily: 'Inter_700Bold', fontSize: 15 }, arrows: { flexDirection: 'row', gap: 18 }, weekRow: { flexDirection: 'row', justifyContent: 'space-between' }, weekday: { fontFamily: 'Inter_600SemiBold', fontSize: 10, width: 32, textAlign: 'center' }, dayCell: { alignItems: 'center', gap: 5, width: 32 }, dateCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, dateText: { fontFamily: 'Inter_700Bold', fontSize: 13 }, monthGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }, monthCell: { width: '14.2857%', height: 49, alignItems: 'center', gap: 3 }, monthDate: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, monthDateText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, dot: { width: 4, height: 4, borderRadius: 2 }, segment: { marginHorizontal: 18, marginTop: 18, borderRadius: 14, padding: 3, flexDirection: 'row' }, segmentButton: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 11 }, segmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, sectionRow: { marginHorizontal: 22, marginTop: 25, marginBottom: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 }, count: { fontFamily: 'Inter_400Regular', fontSize: 11 }, agendaCard: { marginHorizontal: 18, borderWidth: 1, borderRadius: 18, overflow: 'hidden' }, eventRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: '#D9DED9' }, eventTime: { fontFamily: 'Inter_500Medium', width: 58, fontSize: 10, lineHeight: 14 }, eventBar: { width: 3, height: 38, borderRadius: 2 }, eventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 5 }, eventLocation: { fontFamily: 'Inter_400Regular', fontSize: 11 }, tag: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.5, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 }, empty: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 8 }, emptyText: { fontFamily: 'Inter_500Medium', fontSize: 12 }, weekEventsCard: { marginHorizontal: 18, borderWidth: 1, borderRadius: 18, overflow: 'hidden' }, weekEvent: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13 }, weekDateBlock: { width: 48, height: 53, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, weekDateDay: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 }, weekDateNumber: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 24 }, weekEventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, weekEventMeta: { fontFamily: 'Inter_400Regular', fontSize: 11 }, backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 35 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }, modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 22 }, modalDate: { fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 16 }, input: { height: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 9 }, timeInputs: { flexDirection: 'row', gap: 8 }, halfInput: { flex: 1 }, save: { height: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 6 }, saveText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },
});