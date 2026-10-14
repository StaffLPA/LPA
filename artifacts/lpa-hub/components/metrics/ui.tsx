import React, { ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';

export const GOOD = '#4FB286';
export const BAD = '#E0625A';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}
export function H({ children, sub }: { children: ReactNode; sub?: string }) {
  const c = useColors();
  return <View style={{ marginBottom: 10 }}><Text style={[s.h, { color: c.foreground }]}>{children}</Text>{sub ? <Text style={[s.sub, { color: c.mutedForeground }]}>{sub}</Text> : null}</View>;
}
export function Label({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[s.label, { color: c.mutedForeground }]}>{children}</Text>;
}
export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: any }) {
  const c = useColors();
  return <Text style={[s.body, { color: muted ? c.mutedForeground : c.foreground }, style]}>{children}</Text>;
}
export function Btn({ label, onPress, icon, kind = 'primary', disabled, loading, testID }: { label: string; onPress: () => void; icon?: any; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean; testID?: string }) {
  const c = useColors();
  const bg = kind === 'primary' ? c.primary : kind === 'danger' ? `${c.destructive}22` : 'transparent';
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? c.destructive : c.foreground;
  return <Pressable testID={testID} accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={[s.btn, { backgroundColor: bg, borderColor: kind === 'primary' ? c.primary : kind === 'danger' ? c.destructive : c.border, opacity: disabled ? 0.45 : 1 }]}>
    {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Feather name={icon} size={15} color={fg} /> : null}
    <Text style={[s.btnText, { color: fg }]}>{label}</Text>
  </Pressable>;
}
export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress: () => void; testID?: string }) {
  const c = useColors();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress} style={[s.chip, { borderColor: active ? c.primary : c.border, backgroundColor: active ? `${c.primary}26` : c.card }]}><Text style={[s.chipText, { color: active ? c.primary : c.mutedForeground }]}>{label}</Text></Pressable>;
}
export function Field({ label, ...rest }: TextInputProps & { label: string }) {
  const c = useColors();
  return <View style={{ marginBottom: 10, flex: 1, minWidth: 120 }}><Label>{label}</Label><TextInput placeholderTextColor={c.mutedForeground} {...rest} style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background }, rest.multiline ? { minHeight: 64, textAlignVertical: 'top' } : null, rest.style]} /></View>;
}
export function SearchBox({ value, onChange, placeholder, testID }: { value: string; onChange: (v: string) => void; placeholder: string; testID?: string }) {
  const c = useColors();
  return <View style={[s.search, { backgroundColor: c.card, borderColor: c.border }]}><Feather name="search" size={15} color={c.mutedForeground} /><TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.mutedForeground} style={[s.searchInput, { color: c.foreground }]} /></View>;
}
export function Empty({ title, copy, action }: { title: string; copy?: string; action?: ReactNode }) {
  const c = useColors();
  return <View style={[s.empty, { borderColor: c.border }]}><Feather name="clipboard" size={22} color={c.mutedForeground} /><Text style={[s.h, { color: c.foreground, marginTop: 8, fontSize: 14 }]}>{title}</Text>{copy ? <Text style={[s.sub, { color: c.mutedForeground, textAlign: 'center' }]}>{copy}</Text> : null}{action}</View>;
}
export function ErrorBox({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const c = useColors();
  return <View style={[s.empty, { borderColor: c.destructive }]}><Feather name="alert-circle" size={22} color={c.destructive} /><Text style={[s.sub, { color: c.foreground, textAlign: 'center', marginVertical: 8 }]}>{message || 'This could not load.'}</Text>{onRetry ? <Btn label="Retry" icon="refresh-cw" kind="ghost" onPress={onRetry} /> : null}</View>;
}
export function Skeleton({ h = 90 }: { h?: number }) {
  const c = useColors();
  return <View style={{ height: h, borderRadius: 14, backgroundColor: c.muted, marginBottom: 10, opacity: 0.6 }} />;
}
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const c = useColors();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={s.backdrop} onPress={onClose}>
      <Pressable onPress={(e) => e.stopPropagation()} style={[s.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.sheetHead}><Text style={[s.h, { color: c.foreground, flex: 1 }]}>{title}</Text><Pressable accessibilityLabel="Close" onPress={onClose}><Feather name="x" size={20} color={c.mutedForeground} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
      </Pressable>
    </Pressable>
  </Modal>;
}
export function Confirm({ visible, title, copy, confirmLabel, onConfirm, onCancel }: { visible: boolean; title: string; copy: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return <Sheet visible={visible} title={title} onClose={onCancel}><Body muted>{copy}</Body><View style={{ flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}><Btn label="Cancel" kind="ghost" onPress={onCancel} /><Btn label={confirmLabel} onPress={onConfirm} /></View></Sheet>;
}
export function useWide() {
  const [w, setW] = React.useState(0);
  return { w, wide: w >= 760, onLayout: (e: any) => setW(e.nativeEvent.layout.width) };
}
export const webMax: ViewStyle = Platform.OS === 'web' ? { maxWidth: 1180, width: '100%', alignSelf: 'center' } : {};

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  h: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3, lineHeight: 17 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  btn: { minHeight: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  btnText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  chip: { minHeight: 34, borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, justifyContent: 'center', marginRight: 7, marginBottom: 7 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, fontFamily: 'Inter_400Regular', fontSize: 13 },
  search: { minHeight: 42, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 8, marginBottom: 10 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, padding: 22, alignItems: 'center', marginBottom: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', padding: 16 },
  sheet: { borderWidth: 1, borderRadius: 20, padding: 16, maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
});
