import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { Btn, Sheet } from './ui';
import { fmtDate, phoenixToday } from '@/lib/metrics';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');
const valid = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const parsed = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
};

/** Calendar modal. Stores YYYY-MM-DD, blocks dates after Arizona today, closes on selection without changing data if dismissed. */
export function DateCalendarSheet({ visible, title, value, testIDPrefix, minDate, onSelect, onClose }: { minDate?: string; visible: boolean; title: string; value: string; testIDPrefix: string; onSelect: (d: string) => void; onClose: () => void }) {
  const c = useColors();
  const today = phoenixToday();
  const [ym, setYm] = useState(() => (valid(value) ? value : today).slice(0, 7));
  useEffect(() => { if (visible) setYm((valid(value) && value <= today ? value : today).slice(0, 7)); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1;
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const move = (d: number) => { const t = new Date(Date.UTC(y, m + d, 1)); setYm(`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`); };
  const nextBlocked = `${ym}-01` >= `${today.slice(0, 7)}-01`;
  const prevBlocked = !!minDate && `${ym}-01` <= `${minDate.slice(0, 7)}-01`;
  const pick = (d: string) => { if (d > today || (minDate && d < minDate)) return; onSelect(d); onClose(); };
  return <Sheet visible={visible} title={title} onClose={onClose}>
    <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 8 }}>Selected: {valid(value) ? fmtDate(value) : 'none'}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <Pressable testID={`${testIDPrefix}-prev`} accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: prevBlocked }} disabled={prevBlocked} onPress={() => move(-1)} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', opacity: prevBlocked ? 0.35 : 1 }}><Feather name="chevron-left" size={18} color={c.foreground} /></Pressable>
      <Text accessibilityRole="header" style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>{MONTHS[m]} {y}</Text>
      <Pressable testID={`${testIDPrefix}-next`} accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: nextBlocked }} disabled={nextBlocked} onPress={() => move(1)} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', opacity: nextBlocked ? 0.35 : 1 }}><Feather name="chevron-right" size={18} color={c.foreground} /></Pressable>
    </View>
    <View style={{ flexDirection: 'row' }}>{DOW.map((d) => <Text key={d} style={{ width: '14.285%', textAlign: 'center', color: c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 10, marginBottom: 4 }}>{d}</Text>)}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {cells.map((d, i) => {
        if (d === null) return <View key={i} style={{ width: '14.285%', height: 42 }} />;
        const iso = `${ym}-${pad(d)}`; const future = iso > today || (!!minDate && iso < minDate); const sel = iso === value; const isToday = iso === today;
        return <View key={i} style={{ width: '14.285%', height: 42, padding: 2 }}>
          <Pressable testID={`${testIDPrefix}-day-${iso}`} accessibilityRole="button" accessibilityLabel={fmtDate(iso)} accessibilityState={{ selected: sel, disabled: future }} disabled={future} onPress={() => pick(iso)} style={{ flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.primary : 'transparent', borderWidth: isToday && !sel ? 1 : 0, borderColor: c.primary, opacity: future ? 0.3 : 1 }}>
            <Text style={{ color: sel ? '#fff' : c.foreground, fontFamily: sel ? 'Inter_700Bold' : 'Inter_500Medium', fontSize: 13 }}>{d}</Text>
          </Pressable>
        </View>;
      })}
    </View>
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 12 }}>
      <Btn label="Today" kind="ghost" testID={`${testIDPrefix}-today`} onPress={() => pick(today)} />
      <Btn label="Cancel" kind="ghost" testID={`${testIDPrefix}-cancel`} onPress={onClose} />
    </View>
  </Sheet>;
}
