import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LpaIcon as Feather, type LpaIconName } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';

export const FORMS_REFRESH_MS = 30_000;

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = error as { status?: number; data?: { error?: string; message?: string } | null; message?: string } | null;
  const detail = e?.data?.error ?? e?.data?.message ?? e?.message;
  if (e?.status === 409) return `${detail ?? 'This form changed.'} Reload the latest version and try again.`;
  return detail || fallback;
}

export function formatDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'No answer';
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function useStatusTone(status: string) {
  const c = useColors();
  if (status === 'Approved') return { fg: c.accent, bg: `${c.accent}22` };
  if (status === 'Denied') return { fg: c.destructive, bg: `${c.destructive}22` };
  if (status === 'Pending Approval') return { fg: '#E0A458', bg: '#E0A45822' };
  return { fg: c.mutedForeground, bg: c.secondary };
}

export function StatusPill({ status }: { status: string }) {
  const tone = useStatusTone(status);
  return <View style={[s.pill, { backgroundColor: tone.bg }]}><Text style={[s.pillText, { color: tone.fg }]}>{status.toUpperCase()}</Text></View>;
}

export function BackButton({ onPress, icon = 'arrow-left', label = 'Go back' }: { onPress: () => void; icon?: LpaIconName; label?: string }) {
  const c = useColors();
  return <Pressable testID="forms-back" accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.back, { backgroundColor: c.card, borderColor: c.border }]}><Feather name={icon} size={18} color={c.foreground} /></Pressable>;
}

export function Banner({ tone, text, onRetry }: { tone: 'error' | 'success' | 'info'; text: string; onRetry?: () => void }) {
  const c = useColors();
  const color = tone === 'error' ? c.destructive : tone === 'success' ? c.accent : c.mutedForeground;
  return <View accessibilityRole="alert" style={[s.banner, { borderColor: color, backgroundColor: `${color}18` }]}>
    <Text style={[s.bannerText, { color: c.foreground }]}>{text}</Text>
    {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={s.retry}><Text style={{ color, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Retry</Text></Pressable> : null}
  </View>;
}

export function Skeleton({ height = 78 }: { height?: number }) {
  const c = useColors();
  return <View style={{ height, borderRadius: 17, backgroundColor: c.secondary, opacity: 0.6, marginBottom: 11 }} />;
}

export function Button({ label, onPress, disabled, loading, tone = 'primary', testID }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: 'primary' | 'danger' | 'ghost'; testID?: string }) {
  const c = useColors();
  const bg = tone === 'primary' ? c.primary : tone === 'danger' ? c.destructive : c.secondary;
  const off = disabled || loading;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }} disabled={off} onPress={onPress} style={[s.btn, { backgroundColor: bg, opacity: off ? 0.5 : 1, borderColor: c.border, borderWidth: tone === 'ghost' ? 1 : 0 }]}>
    <Text style={{ color: tone === 'ghost' ? c.foreground : '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>{loading ? 'Working...' : label}</Text>
  </Pressable>;
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const c = useColors();
  return <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[s.chip, { backgroundColor: selected ? `${c.primary}33` : c.secondary, borderColor: selected ? c.primary : c.border }]}>
    <Text style={{ color: selected ? c.foreground : c.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12 }}>{label}</Text>
  </Pressable>;
}

export const s = StyleSheet.create({
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  pillText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.9 },
  back: { width: 46, height: 46, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  banner: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  retry: { paddingHorizontal: 10, paddingVertical: 6 },
  btn: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
});
