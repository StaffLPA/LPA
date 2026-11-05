import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BuildPublicAthlete } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { LpaIcon as Icon } from '@/components/LpaIcon';

export type BuildAthleteSlotsProps = {
  slots: (BuildPublicAthlete | null)[];
  activeAthleteId: string | null;
  athletes: BuildPublicAthlete[];
  onSelectSlot: (index: number) => void;
  onAssignSlot: (index: number, athlete: BuildPublicAthlete) => void;
  onRemoveSlot: (index: number) => void;
  disabled?: boolean;
};

const HOLD_MS = 600;
const parts = (n: string) => n.trim().split(/\s+/).filter(Boolean);

/** First names; collisions get last initial; still-ambiguous get full names. */
export function slotLabels(slots: (BuildPublicAthlete | null)[]): (string | null)[] {
  const first = slots.map((a) => (a ? parts(a.displayName)[0] ?? a.displayName : null));
  const withInitial = slots.map((a, i) => {
    if (!a) return null;
    const f = first[i]!;
    if (first.filter((x) => x && x.toLowerCase() === f.toLowerCase()).length < 2) return f;
    const p = parts(a.displayName);
    return p.length > 1 ? `${f} ${p[p.length - 1][0].toUpperCase()}.` : f;
  });
  return slots.map((a, i) => {
    if (!a) return null;
    const l = withInitial[i]!;
    return withInitial.filter((x) => x && x.toLowerCase() === l.toLowerCase()).length > 1 ? a.displayName : l;
  });
}

/** Web-only: kill text selection, iOS callout and context menu on the node. */
function useNoCallout() {
  return useCallback((node: unknown) => {
    if (Platform.OS !== 'web' || !node) return;
    const el = node as HTMLElement;
    if (!el.style) return;
    el.style.setProperty('-webkit-touch-callout', 'none');
    el.style.setProperty('-webkit-user-select', 'none');
    el.style.setProperty('user-select', 'none');
    el.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    if (!(el as any).__lpaNoCtx) { (el as any).__lpaNoCtx = true; el.addEventListener('contextmenu', (e) => e.preventDefault()); }
  }, []);
}

function Slot({ index, athlete, label, active, disabled, onTap, onHold }: {
  index: number; athlete: BuildPublicAthlete | null; label: string | null; active: boolean; disabled?: boolean;
  onTap: () => void; onHold: () => void;
}) {
  const c = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const native = Platform.OS !== 'web';
  const noCallout = useNoCallout();

  const start = () => {
    if (!athlete || disabled) return;
    Animated.timing(scale, { toValue: 0.94, duration: HOLD_MS, useNativeDriver: native }).start();
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, useNativeDriver: native }).start();
  };
  const reset = () => {
    progress.stopAnimation(); scale.stopAnimation();
    Animated.spring(scale, { toValue: 1, useNativeDriver: native, friction: 5 }).start();
    Animated.timing(progress, { toValue: 0, duration: 140, useNativeDriver: native }).start();
  };

  const bg = active ? c.primary : athlete ? c.card : 'transparent';
  const fg = active ? c.primaryForeground : athlete ? c.foreground : c.mutedForeground;
  const a11y = athlete
    ? `Slot ${index + 1}: ${athlete.displayName}${active ? ', active' : ''}. Tap to switch, hold to change athlete.`
    : `Slot ${index + 1}: empty. Add athlete.`;

  return <Animated.View style={[st.slotWrap, { transform: [{ scale }] }]}>
    <Pressable
      ref={noCallout as any}
      testID={`build-slot-${index}`}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: active, disabled: !!disabled }}
      accessibilityActions={athlete ? [{ name: 'longpress', label: 'Change athlete' }] : undefined}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') onHold(); }}
      disabled={disabled}
      delayLongPress={HOLD_MS}
      onPressIn={start}
      onPressOut={reset}
      onPress={() => (athlete ? onTap() : onHold())}
      onLongPress={athlete ? () => { reset(); onHold(); } : undefined}
      style={({ pressed }) => [st.slot, {
        flexDirection: athlete ? 'row' : 'column',
        gap: athlete ? 4 : 2,
        backgroundColor: bg,
        borderColor: active ? c.primary : c.border,
        borderStyle: athlete ? 'solid' : 'dashed',
        opacity: disabled ? 0.5 : pressed && !athlete ? 0.75 : 1,
      }, Platform.OS === 'web' ? ({ userSelect: 'none', cursor: disabled ? 'default' : 'pointer' } as any) : null]}
    >
      {athlete ? null : <Icon name="plus" size={14} color={fg} />}
      <Text numberOfLines={athlete ? 1 : 2} selectable={false} style={[st.slotText, { color: fg }, !athlete && st.slotEmpty]}>
        {athlete ? label : 'Add athlete'}
      </Text>
      {athlete ? <View pointerEvents="none" style={st.trackWrap}>
        <Animated.View style={[st.track, {
          backgroundColor: active ? c.primaryForeground : c.primary,
          transform: [{ scaleX: progress }],
        }]} />
      </View> : null}
    </Pressable>
  </Animated.View>;
}

function Picker({ index, slots, athletes, onClose, onAssign, onRemove }: {
  index: number | null; slots: (BuildPublicAthlete | null)[]; athletes: BuildPublicAthlete[];
  onClose: () => void; onAssign: (a: BuildPublicAthlete) => void; onRemove: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const visible = index !== null;
  useEffect(() => { if (visible) setQ(''); }, [visible]);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [visible]);

  const current = index !== null ? slots[index] : null;
  const takenBy = useMemo(() => {
    const m = new Map<string, number>();
    slots.forEach((a, i) => { if (a && i !== index) m.set(a.id, i); });
    return m;
  }, [slots, index]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...athletes]
      .filter((a) => !t || a.displayName.toLowerCase().includes(t))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [athletes, q]);

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable testID="build-slot-picker-backdrop" accessibilityLabel="Close" style={[st.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]} onPress={onClose}>
      <Pressable testID="build-slot-picker" onPress={(e) => e.stopPropagation()} accessibilityViewIsModal
        style={[st.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={st.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={[st.title, { color: c.foreground }]}>Change athlete</Text>
            <Text numberOfLines={1} style={[st.kicker, { color: c.mutedForeground }]}>
              Slot {(index ?? 0) + 1}{current ? ` · ${current.displayName}` : ' · empty'}
            </Text>
          </View>
          <Pressable testID="build-slot-picker-close" accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}
            hitSlop={8} style={[st.close, { borderColor: c.border }]}>
            <Icon name="x" size={18} color={c.foreground} />
          </Pressable>
        </View>
        <View style={[st.search, { borderColor: c.border, backgroundColor: c.background }]}>
          <Icon name="search" size={15} color={c.mutedForeground} />
          <TextInput testID="build-slot-search" value={q} onChangeText={setQ} placeholder="Search all athletes"
            placeholderTextColor={c.mutedForeground} autoCorrect={false} autoCapitalize="words" accessibilityLabel="Search athletes"
            style={[st.searchInput, { color: c.foreground }]} />
        </View>
        {takenBy.size ? <Text style={[st.hint, { color: c.mutedForeground }]}>Athletes already in another slot are greyed out. Remove them there first.</Text> : null}
        <FlatList
          data={list}
          keyExtractor={(a) => a.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          windowSize={7}
          scrollEnabled={list.length > 0}
          style={[st.list, { borderColor: c.border }]}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />}
          ListEmptyComponent={<View style={st.empty}>
            <Icon name="users" size={22} color={c.mutedForeground} />
            <Text style={[st.emptyTitle, { color: c.foreground }]}>{athletes.length ? 'No name matches' : 'No athletes yet'}</Text>
            <Text style={[st.kicker, { color: c.mutedForeground, textAlign: 'center' }]}>{athletes.length ? 'Try fewer letters.' : 'Ask your coach to add you.'}</Text>
          </View>}
          renderItem={({ item }) => {
            const taken = takenBy.get(item.id);
            const isCur = current?.id === item.id;
            const blocked = taken !== undefined;
            return <Pressable testID={`build-slot-option-${item.id}`} accessibilityRole="button" disabled={blocked}
              accessibilityState={{ disabled: blocked, selected: isCur }}
              accessibilityLabel={`${item.displayName}${blocked ? `, already in slot ${taken! + 1}` : isCur ? ', current' : ''}`}
              onPress={() => onAssign(item)}
              style={({ pressed }) => [st.row, { opacity: blocked ? 0.4 : 1 }, (pressed || isCur) && { backgroundColor: `${c.primary}1F` }]}>
              <View style={[st.avatar, { backgroundColor: isCur ? c.primary : c.muted }]}>
                <Text style={[st.avatarText, { color: isCur ? c.primaryForeground : c.foreground }]}>
                  {parts(item.displayName).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text numberOfLines={1} style={[st.rowText, { color: c.foreground }]}>{item.displayName}</Text>
              {blocked ? <Text style={[st.tag, { color: c.mutedForeground, borderColor: c.border }]}>Slot {taken! + 1}</Text>
                : isCur ? <Icon name="check" size={16} color={c.primary} /> : null}
            </Pressable>;
          }}
        />
        {current ? <Pressable testID="build-slot-remove" accessibilityRole="button" accessibilityLabel={`Remove ${current.displayName} from slot ${(index ?? 0) + 1}`}
          onPress={onRemove} style={[st.remove, { borderColor: c.destructive, backgroundColor: `${c.destructive}1A` }]}>
          <Icon name="trash-2" size={15} color={c.destructive} />
          <Text style={[st.removeText, { color: c.destructive }]}>Remove from slot</Text>
        </Pressable> : null}
      </Pressable>
    </Pressable>
  </Modal>;
}

export function BuildAthleteSlots({ slots, activeAthleteId, athletes, onSelectSlot, onAssignSlot, onRemoveSlot, disabled }: BuildAthleteSlotsProps) {
  const four = useMemo(() => [0, 1, 2, 3].map((i) => slots[i] ?? null), [slots]);
  const labels = useMemo(() => slotLabels(four), [four]);
  const [editing, setEditing] = useState<number | null>(null);
  const close = useCallback(() => setEditing(null), []);

  return <View style={st.root} accessibilityLabel="Athlete slots">
    <View style={st.row4}>
      {four.map((a, i) => <Slot key={i} index={i} athlete={a} label={labels[i]} active={!!a && a.id === activeAthleteId}
        disabled={disabled} onTap={() => onSelectSlot(i)} onHold={() => setEditing(i)} />)}
    </View>
    <Picker index={editing} slots={four} athletes={athletes} onClose={close}
      onAssign={(a) => { if (editing !== null) onAssignSlot(editing, a); setEditing(null); }}
      onRemove={() => { if (editing !== null) onRemoveSlot(editing); setEditing(null); }} />
  </View>;
}

export default BuildAthleteSlots;

const st = StyleSheet.create({
  root: { width: '100%', maxWidth: 520 },
  row4: { flexDirection: 'row', gap: 6, width: '100%' },
  slotWrap: { flex: 1, minWidth: 0 },
  slot: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden' },
  slotText: { fontFamily: 'Inter_700Bold', fontSize: 13, flexShrink: 1 },
  slotEmpty: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  trackWrap: { position: 'absolute', left: 10, right: 10, bottom: 5, height: 2, borderRadius: 1, overflow: 'hidden' },
  track: { flex: 1, borderRadius: 1, opacity: 0.85 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', paddingHorizontal: 16 },
  sheet: { borderWidth: 1, borderRadius: 20, padding: 16, maxHeight: '100%', width: '100%', maxWidth: 520, alignSelf: 'center', flexShrink: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.3 },
  kicker: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
  close: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 48, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, minHeight: 44 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  list: { borderWidth: 1, borderRadius: 14, flexGrow: 0, flexShrink: 1, minHeight: 120 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 56 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  rowText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, flex: 1 },
  tag: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, textTransform: 'uppercase' },
  empty: { alignItems: 'center', padding: 24, gap: 4 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 6 },
  remove: { marginTop: 12, minHeight: 48, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  removeText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
});
