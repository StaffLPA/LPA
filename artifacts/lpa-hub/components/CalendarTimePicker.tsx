import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { calendarTimeSlots, normalizeCalendarTime } from '@/lib/calendarTime';

/** Shared time entry for Calendar quick-add and Admin Dashboard create/edit forms. */
export function CalendarTimeField({ value, title, onChange, testIDPrefix = 'time-field' }: {
  value: string;
  title: string;
  onChange: (value: string) => void;
  testIDPrefix?: string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const normalized = normalizeCalendarTime(value);

  return <View style={styles.field}>
    <View style={[styles.control, { backgroundColor: colors.background, borderColor: open ? colors.primary : colors.border }]}>
      <Feather name="clock" size={15} color={value ? colors.primary : colors.mutedForeground} />
      <TextInput
        testID={`${testIDPrefix}-manual`}
        accessibilityLabel={`Enter ${title.toLowerCase()}`}
        value={value}
        onChangeText={onChange}
        onEndEditing={() => { if (normalized) onChange(normalized); }}
        placeholder={title}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="done"
        style={[styles.input, { color: colors.foreground }]}
      />
      <Pressable
        testID={testIDPrefix}
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Hide' : 'Show'} ${title.toLowerCase()} options`}
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        onPress={() => setOpen((current) => !current)}
        style={styles.toggle}
      >
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
    {value.trim() && !normalized ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]}>
      Enter a valid time, such as 4:15 PM or 16:15.
    </Text> : null}
    {open ? <ScrollView
      testID={`${testIDPrefix}-options`}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      style={[styles.options, { backgroundColor: colors.card, borderColor: colors.border }]}
      contentContainerStyle={styles.optionGrid}
    >
      {calendarTimeSlots.map((slot) => <Pressable
        key={slot}
        testID={`${testIDPrefix}-${slot.replace(/[: ]/g, '-')}`}
        accessibilityRole="button"
        accessibilityState={{ selected: slot === normalized }}
        onPress={() => { onChange(slot); setOpen(false); }}
        style={[styles.option, {
          borderColor: colors.border,
          backgroundColor: slot === normalized ? colors.secondary : colors.background,
        }]}
      >
        <Text style={[styles.optionText, { color: slot === normalized ? colors.primary : colors.foreground }]}>{slot}</Text>
      </Pressable>)}
    </ScrollView> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 0 },
  control: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingLeft: 10, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 7 },
  input: { flex: 1, minWidth: 0, paddingVertical: 9, paddingHorizontal: 0, fontFamily: 'Inter_500Medium', fontSize: 12 },
  toggle: { minWidth: 30, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  error: { marginTop: 4, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15 },
  options: { maxHeight: 176, borderWidth: 1, borderRadius: 11, marginTop: 5 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 6 },
  option: { width: '48%', minHeight: 36, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  optionText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
});
