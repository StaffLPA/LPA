import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateCalendarEvent, useCreateRepeatedCalendarEvents } from '@workspace/api-client-react';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { CalendarLocationPicker } from '@/components/CalendarLocationPicker';
import { CalendarTimeField } from '@/components/CalendarTimePicker';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { useTagCatalog } from '@/hooks/useTagCatalog';
import { normalizeCalendarTime } from '@/lib/calendarTime';
import { canonicalTeam, getTeamColor, tagLabel } from '@/constants/tagCatalog';
import type { TagCatalog } from '@/constants/tagCatalog';

const pad = (value: number) => String(value).padStart(2, '0');
const displayDate = (date: Date) => `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()}`;

function dateFromDisplay(value: string) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  return date.getFullYear() === Number(match[3]) &&
    date.getMonth() === Number(match[1]) - 1 &&
    date.getDate() === Number(match[2]) ? date : null;
}

function toApiDate(value: string) {
  const date = dateFromDisplay(value);
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';
}

function PickerSheet({ visible, title, onClose, colors, children }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.pickerBackdrop}>
      <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
        <View style={styles.pickerHeader}>
          <View>
            <Text style={[styles.formLabel, { color: colors.primary }]}>CALENDAR</Text>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>{title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close picker" onPress={onClose}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
        {children}
      </View>
    </View>
  </Modal>;
}

function DatePickerModal({ visible, value, initialDate, onClose, onChange, colors }: {
  visible: boolean;
  value: string;
  initialDate?: string;
  onClose: () => void;
  onChange: (value: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const today = new Date();
  const [monthStart, setMonthStart] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  useEffect(() => {
    if (!visible) return;
    const selected = dateFromDisplay(value) ?? dateFromDisplay(initialDate ?? '');
    setMonthStart(selected
      ? new Date(selected.getFullYear(), selected.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth(), 1));
  }, [visible, value, initialDate]);
  const selected = dateFromDisplay(value);
  const shownMonth = monthStart;
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();
  const leadingDays = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((leadingDays + daysInMonth) / 7) * 7 }, (_, index) => index - leadingDays + 1);

  return <PickerSheet visible={visible} title="Choose event date" onClose={onClose} colors={colors}>
    <View style={styles.monthPickerHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonthStart(new Date(year, month - 1, 1))} style={styles.pickerIcon}>
        <Feather name="chevron-left" size={18} color={colors.primary} />
      </Pressable>
      <Text style={[styles.monthPickerTitle, { color: colors.foreground }]}>{shownMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonthStart(new Date(year, month + 1, 1))} style={styles.pickerIcon}>
        <Feather name="chevron-right" size={18} color={colors.primary} />
      </Pressable>
    </View>
    <View style={styles.weekdayPickerRow}>
      {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) =>
        <Text key={day} style={[styles.weekdayPickerText, { color: colors.mutedForeground }]}>{day}</Text>)}
    </View>
    <View style={styles.datePickerGrid}>
      {cells.map((day, index) => {
        const active = day > 0 && day <= daysInMonth;
        const date = active ? new Date(year, month, day) : null;
        const isSelected = Boolean(date && selected && date.getFullYear() === selected.getFullYear() &&
          date.getMonth() === selected.getMonth() && date.getDate() === selected.getDate());
        return <Pressable
          key={`${year}-${month}-${index}`}
          disabled={!active}
          testID={active ? `calendar-quick-date-${day}` : undefined}
          onPress={() => {
            if (date) {
              setMonthStart(new Date(year, month, 1));
              onChange(displayDate(date));
              onClose();
            }
          }}
          style={[styles.datePickerCell, isSelected && { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.datePickerDay, { color: isSelected ? '#fff' : active ? colors.foreground : colors.muted }]}>{active ? day : ''}</Text>
        </Pressable>;
      })}
    </View>
    <Pressable onPress={() => { setMonthStart(new Date(today.getFullYear(), today.getMonth(), 1)); onChange(displayDate(today)); onClose(); }}
      style={[styles.todayButton, { borderColor: colors.border }]}>
      <Text style={[styles.todayButtonText, { color: colors.primary }]}>Today</Text>
    </Pressable>
  </PickerSheet>;
}

function EventField({ value, onChangeText, placeholder, colors, multiline, maxLength }: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  multiline?: boolean;
  maxLength?: number;
}) {
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
    placeholderTextColor={colors.mutedForeground} multiline={multiline} maxLength={maxLength}
    textAlignVertical={multiline ? 'top' : undefined}
    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
      multiline && styles.multilineInput]} />;
}

function TeamChoices({ catalog, value, onChange, colors }: {
  catalog: TagCatalog;
  value: string;
  onChange: (value: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return <View style={styles.choiceRow}>
    {catalog.teams.map((option) => {
      const selected = canonicalTeam(catalog, value) === option.id;
      const color = getTeamColor(catalog, option.id);
      return <Pressable key={option.id} testID={`calendar-quick-team-${option.id}`}
        accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onChange(option.id)}
        style={[styles.choice, { backgroundColor: selected ? color : colors.muted, borderColor: selected ? color : colors.border }]}>
        <View style={[styles.teamDot, { backgroundColor: color }]} />
        <Text style={[styles.choiceText, { color: selected ? (option.id === 'LPA' ? colors.accentForeground : '#fff') : colors.foreground }]}>
          {tagLabel(catalog, 'teams', option.id)}
        </Text>
      </Pressable>;
    })}
  </View>;
}

export function CalendarQuickAddModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const { user } = useApp();
  const catalog = useTagCatalog().data;
  const queryClient = useQueryClient();
  const allowed = user?.role === 'Admin' || user?.role === 'Staff-Coach';
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [team, setTeam] = useState('LPA Events');
  const [repeatDaily, setRepeatDaily] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [repeatDatePickerOpen, setRepeatDatePickerOpen] = useState(false);

  const invalidateCalendars = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['/api/calendar.ics'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/admin/calendar-events'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/calendar-events'] }),
  ]);
  const createEvent = useCreateCalendarEvent({ mutation: { onSuccess: invalidateCalendars } });
  const createRepeatedEvents = useCreateRepeatedCalendarEvents({ mutation: { onSuccess: invalidateCalendars } });
  const loading = createEvent.isPending || createRepeatedEvents.isPending;

  const reset = () => {
    setTitle('');
    setDate('');
    setStartTime('');
    setEndTime('');
    setLocation('');
    setAddress('');
    setNotes('');
    setTeam('LPA Events');
    setRepeatDaily(false);
    setRepeatUntil('');
    setDatePickerOpen(false);
    setRepeatDatePickerOpen(false);
  };
  const close = () => { reset(); onClose(); };
  const save = async () => {
    if (!title.trim() || !date || !startTime || (repeatDaily && !repeatUntil)) return;
    const normalizedStartTime = normalizeCalendarTime(startTime);
    const normalizedEndTime = endTime.trim() ? normalizeCalendarTime(endTime) : '';
    if (!normalizedStartTime || (endTime.trim() && !normalizedEndTime)) {
      Alert.alert('Enter a valid time', 'Use a time such as 4:15 PM or 16:15.');
      return;
    }
    const apiStartDate = toApiDate(date);
    const apiEndDate = repeatDaily ? toApiDate(repeatUntil) : apiStartDate;
    if (!apiStartDate) {
      Alert.alert('Enter a valid date', 'Choose a valid event date.');
      return;
    }
    if (repeatDaily && (!apiEndDate || apiEndDate < apiStartDate)) {
      Alert.alert('Enter a valid end date', 'Choose an end date on or after the event date.');
      return;
    }
    if (repeatDaily && (Date.parse(`${apiEndDate}T00:00:00.000Z`) - Date.parse(`${apiStartDate}T00:00:00.000Z`)) / 86_400_000 > 366) {
      Alert.alert('Repeat range is too long', 'Daily repeating events can span up to one year.');
      return;
    }
    const data = {
      title: title.trim(),
      date: apiStartDate,
      time: normalizedEndTime ? `${normalizedStartTime} - ${normalizedEndTime}` : normalizedStartTime,
      location: location.trim() || 'LPA Campus',
      locationAddress: address.trim() || null,
      notes: notes.trim() || null,
      team,
    };
    try {
      if (repeatDaily) await createRepeatedEvents.mutateAsync({ data: { ...data, repeatUntil: apiEndDate } });
      else await createEvent.mutateAsync({ data });
      close();
    } catch (error) {
      Alert.alert('Could not add event', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  if (!allowed) return null;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <View style={styles.backdrop}>
      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.formContent} bottomOffset={56}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>Add an event</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Visible to the selected LPA team.</Text>
            </View>
            <Pressable testID="calendar-quick-close" accessibilityRole="button" accessibilityLabel="Close event form"
              onPress={close} hitSlop={10}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <EventField value={title} onChangeText={setTitle} placeholder="Event title" colors={colors} />
          <Pressable testID="calendar-quick-date" accessibilityRole="button" accessibilityLabel="Choose event date"
            onPress={() => setDatePickerOpen(true)} style={[styles.pickerButton, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Feather name="calendar" size={16} color={date ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.pickerText, { color: date ? colors.foreground : colors.mutedForeground }]}>{date || 'Date (MM-DD-YYYY)'}</Text>
            <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
          </Pressable>
          <View style={styles.timeRow}>
            <CalendarTimeField testIDPrefix="calendar-quick-start-time" title="Start time" value={startTime} onChange={setStartTime} />
            <CalendarTimeField testIDPrefix="calendar-quick-end-time" title="End time" value={endTime} onChange={setEndTime} />
          </View>
          <CalendarLocationPicker
            location={location}
            address={address}
            onLocationChange={setLocation}
            onAddressChange={setAddress}
            enabled={visible}
            testIDPrefix="calendar-quick-location"
          />
          <EventField value={notes} onChangeText={setNotes} placeholder="Notes" colors={colors} multiline maxLength={10000} />
          <Pressable testID="calendar-quick-multi-day" accessibilityRole="checkbox" accessibilityState={{ checked: repeatDaily }}
            onPress={() => setRepeatDaily((enabled) => !enabled)}
            style={[styles.repeatRow, { backgroundColor: repeatDaily ? `${colors.primary}18` : colors.background, borderColor: repeatDaily ? colors.primary : colors.border }]}>
            <View style={[styles.repeatCheckbox, { borderColor: repeatDaily ? colors.primary : colors.mutedForeground, backgroundColor: repeatDaily ? colors.primary : 'transparent' }]}>
              {repeatDaily ? <Feather name="check" size={13} color="#fff" /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.repeatTitle, { color: colors.foreground }]}>Multi-day event</Text>
              <Text style={[styles.repeatCopy, { color: colors.mutedForeground }]}>Show one event from its start date through its end date.</Text>
            </View>
            <Feather name={repeatDaily ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
          </Pressable>
          {repeatDaily ? <Pressable testID="calendar-quick-repeat-until" accessibilityRole="button" accessibilityLabel="Choose event end date"
            onPress={() => setRepeatDatePickerOpen(true)} style={[styles.pickerButton, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Feather name="calendar" size={16} color={repeatUntil ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.pickerText, { color: repeatUntil ? colors.foreground : colors.mutedForeground }]}>{repeatUntil || 'End date (MM-DD-YYYY)'}</Text>
            <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
          </Pressable> : null}
          <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TEAM</Text>
          {catalog ? <TeamChoices catalog={catalog} value={team} onChange={setTeam} colors={colors} /> : <ActivityIndicator color={colors.primary} />}
          <Pressable testID="calendar-quick-save" accessibilityRole="button" onPress={() => void save()}
            disabled={loading || !title.trim() || !date || !normalizeCalendarTime(startTime) || (endTime.trim() && !normalizeCalendarTime(endTime)) || (repeatDaily && !repeatUntil)}
            style={[styles.submit, { backgroundColor: title.trim() && date && normalizeCalendarTime(startTime) && (!endTime.trim() || normalizeCalendarTime(endTime)) && (!repeatDaily || repeatUntil) ? colors.primary : colors.muted }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.submitText}>Create event</Text><Feather name="calendar" size={16} color="#fff" /></>}
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    </View>
    <DatePickerModal visible={datePickerOpen} value={date} onClose={() => setDatePickerOpen(false)} onChange={setDate} colors={colors} />
    <DatePickerModal visible={repeatDatePickerOpen} value={repeatUntil} initialDate={date}
      onClose={() => setRepeatDatePickerOpen(false)} onChange={setRepeatUntil} colors={colors} />
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  sheet: { maxHeight: '94%', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 18, overflow: 'hidden' },
  formContent: { gap: 9, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 5 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontFamily: 'Inter_400Regular', fontSize: 13 },
  multilineInput: { minHeight: 96, paddingTop: 12 },
  pickerButton: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  halfPicker: { flex: 1, minWidth: 0 },
  pickerText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  timeRow: { flexDirection: 'row', gap: 8 },
  repeatRow: { minHeight: 58, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  repeatCheckbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  repeatTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  repeatCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  formLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1, marginTop: 3 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  choiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  teamDot: { width: 7, height: 7, borderRadius: 4 },
  submit: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 3 },
  submitText: { fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 12 },
  pickerBackdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  pickerSheet: { width: '100%', maxWidth: 360, alignSelf: 'center', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24, maxHeight: '80%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pickerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 4 },
  monthPickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthPickerTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  pickerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  weekdayPickerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  weekdayPickerText: { width: '14.2857%', textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5 },
  datePickerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  datePickerCell: { width: '14.2857%', height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  datePickerDay: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  todayButton: { minHeight: 43, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  todayButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
});
