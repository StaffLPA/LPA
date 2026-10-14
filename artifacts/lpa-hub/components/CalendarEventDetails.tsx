import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { dateFromKey, dateRangeLabel, timeRangeLabel, type CalendarEvent } from '@/lib/calendarEvents';

export function CalendarEventDetails({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dateText = event
    ? event.endDate
      ? dateRangeLabel(event.date, event.endDate)
      : dateFromKey(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  return <Modal visible={!!event} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.root}>
      <Pressable testID="calendar-event-backdrop" accessibilityLabel="Close event details" style={styles.backdrop} onPress={onClose} />
      {event ? <View testID="calendar-event-details" accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 22 }]}>
        <View style={styles.top}>
          <View style={[styles.badge, { backgroundColor: event.tint }]}><Text style={styles.badgeText} numberOfLines={1}>{event.tag}</Text></View>
          <Pressable testID="close-calendar-event-details" accessibilityRole="button" accessibilityLabel="Close event details" onPress={onClose} hitSlop={10} style={[styles.close, { borderColor: colors.border }]}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{event.title}</Text>
          <View style={styles.row}>
            <Feather name="calendar" size={22} color={colors.mutedForeground} />
            <View style={styles.rowText}>
              <Text style={[styles.heading, { color: colors.foreground }]}>{dateText}</Text>
              <View style={styles.timeLine}><Feather name="clock" size={14} color={colors.mutedForeground} /><Text style={[styles.sub, { color: colors.mutedForeground }]}>{timeRangeLabel(event)}</Text></View>
            </View>
          </View>
          <View style={styles.row}>
            <Feather name="map-pin" size={22} color={colors.mutedForeground} />
            <View style={styles.rowText}>
              <Text style={[styles.heading, { color: colors.foreground }]}>{event.location}</Text>
              {event.locationAddress?.trim() ? <Text style={[styles.sub, { color: colors.mutedForeground }]}>{event.locationAddress}</Text> : null}
            </View>
          </View>
          {event.notes?.trim() ? <View style={styles.row}>
            <Feather name="file-text" size={22} color={colors.mutedForeground} />
            <View style={styles.rowText}>
              <Text style={[styles.heading, { color: colors.foreground }]}>Notes</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>{event.notes}</Text>
            </View>
          </View> : null}
        </ScrollView>
      </View> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill as object, backgroundColor: '#00000099' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, paddingTop: 20, paddingHorizontal: 22 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: 9, paddingHorizontal: 14, paddingVertical: 7, maxWidth: '80%' },
  badgeText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  close: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingTop: 16, paddingBottom: 6, gap: 24 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  row: { flexDirection: 'row', gap: 16 },
  rowText: { flex: 1, gap: 5 },
  heading: { fontFamily: 'Inter_500Medium', fontSize: 17 },
  timeLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
});
