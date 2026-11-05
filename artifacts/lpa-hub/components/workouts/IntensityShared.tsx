import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_INTENSITY_PREFERENCES, INTENSITY_METHODS } from '@workspace/api-client-react';
import type { BuildIntensityPreferences, BuildIntensityProfileInput, IntensityMethod } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Btn } from '@/components/metrics/ui';
import { InfoTip } from '@/components/workouts/IntensityGuide';

export const METHOD_LABEL: Record<IntensityMethod, string> = {
  percentage: '% 1RM', rpe: 'RPE', rir: 'RIR', percentage_plus_rpe: '% + RPE', percentage_plus_rir: '% + RIR',
};
export const METHOD_LONG: Record<IntensityMethod, string> = {
  percentage: 'Percentage Output', rpe: 'RPE', rir: 'RIR', percentage_plus_rpe: 'Percentage + RPE cap', percentage_plus_rir: 'Percentage + RIR cap',
};
export const defaultPreferences = (): BuildIntensityPreferences => ({ ...DEFAULT_INTENSITY_PREFERENCES });
export const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
export const fmtNum = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : String(Math.round(n * 10) / 10));
export const fmtRange = (min?: number | null, max?: number | null, suffix = '') => {
  if (min == null && max == null) return '';
  const a = fmtNum(min ?? max); const b = fmtNum(max ?? min);
  return a === b ? `${a}${suffix}` : `${a}–${b}${suffix}`;
};

export function confirmAsync(title: string, message: string, confirmLabel = 'Continue') {
  return new Promise<boolean>((resolve) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') { resolve(window.confirm(`${title}\n\n${message}`)); return; }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** Runs an intensity update; when the server says a tested 1RM would be replaced (409), asks first and retries with confirmation. */
export async function withTestedConfirm<T>(run: (confirm: boolean) => Promise<T>): Promise<T | null> {
  try { return await run(false); }
  catch (e) {
    if (statusOf(e) !== 409) throw e;
    const ok = await confirmAsync('Replace tested 1RM?', 'This exercise has a tested 1RM. Replacing it with a new value cannot be undone automatically.', 'Replace');
    if (!ok) return null;
    return run(true);
  }
}

export function Segmented<T extends string>({ options, value, onChange, label, testID }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; testID: string;
}) {
  const c = useColors();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[sh.seg, { borderColor: c.border, backgroundColor: c.card }]}>
    {options.map((o) => {
      const on = o.key === value;
      return <Pressable key={o.key} testID={`${testID}-${o.key}`} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${label}: ${o.label}`}
        onPress={() => onChange(o.key)} style={[sh.segBtn, on && { backgroundColor: c.primary }]}>
        <Text style={[sh.segText, { color: on ? c.primaryForeground : c.mutedForeground }]}>{o.label}</Text>
      </Pressable>;
    })}
  </View>;
}

export function MiniLabel({ children, tip }: { children: string; tip?: 'percent' | 'rpe' | 'rir' | 'choose' | 'tips' }) {
  const c = useColors();
  return <View style={sh.miniRow}><Text style={[sh.mini, { color: c.mutedForeground }]}>{children.toUpperCase()}</Text>{tip ? <InfoTip section={tip} /> : null}</View>;
}

export function PreferencesForm({ value, onSave, saving, allowDefaultMethod = true, testID }: {
  value: BuildIntensityPreferences; onSave: (next: BuildIntensityPreferences) => void; saving?: boolean; allowDefaultMethod?: boolean; testID: string;
}) {
  const c = useColors();
  const [draft, setDraft] = useState<BuildIntensityPreferences>(value);
  const [increment, setIncrement] = useState(String(value.roundingIncrement));
  const [error, setError] = useState('');
  const submit = () => {
    const n = Number(increment);
    if (!Number.isFinite(n) || n < 0.25 || n > 100) { setError('Rounding increment must be between 0.25 and 100.'); return; }
    setError('');
    onSave({ ...draft, roundingIncrement: n });
  };
  return <View>
    {allowDefaultMethod ? <>
      <MiniLabel tip="choose">Default intensity method</MiniLabel>
      <View style={sh.wrapRow}>{INTENSITY_METHODS.map((m) => {
        const on = draft.defaultMethod === m;
        return <Pressable key={m} testID={`${testID}-method-${m}`} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setDraft({ ...draft, defaultMethod: m })}
          style={[sh.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? `${c.primary}1F` : 'transparent' }]}>
          <Text style={[sh.chipText, { color: on ? c.primary : c.foreground }]}>{METHOD_LONG[m]}</Text>
        </Pressable>;
      })}</View>
      <Text style={[sh.ormMeta, { color: c.mutedForeground }]}>Used for new exercises while this athlete is selected in the builder. Existing prescriptions stay unchanged.</Text>
    </> : null}
    <MiniLabel tip="rir">Effort scale display</MiniLabel>
    <Segmented testID={`${testID}-scale`} label="Effort scale" value={draft.effortScale} onChange={(v) => setDraft({ ...draft, effortScale: v })}
      options={[{ key: 'rpe', label: 'RPE (1–10)' }, { key: 'rir', label: 'RIR (reps left)' }]} />
    <MiniLabel>Load unit</MiniLabel>
    <Segmented testID={`${testID}-unit`} label="Load unit" value={draft.unit} onChange={(v) => {
      setDraft({ ...draft, unit: v });
      if (increment === '5' && v === 'kg') setIncrement('2.5');
      else if (increment === '2.5' && v === 'lb') setIncrement('5');
    }} options={[{ key: 'lb', label: 'lb' }, { key: 'kg', label: 'kg' }]} />
    <MiniLabel>Round loads to nearest</MiniLabel>
    <TextInput testID={`${testID}-increment`} accessibilityLabel="Load rounding increment" value={increment} onChangeText={setIncrement} keyboardType="decimal-pad"
      style={[sh.input, { color: c.foreground, borderColor: error ? c.destructive : c.border, backgroundColor: c.background }]} />
    {error ? <Text accessibilityRole="alert" style={[sh.err, { color: c.destructive }]}>{error}</Text> : null}
    <View style={{ marginTop: 10 }}><Btn label="Save preferences" onPress={submit} loading={saving} disabled={saving} testID={`${testID}-save`} /></View>
  </View>;
}

export function OneRepMaxForm({ exerciseId, exerciseName, current, defaultUnit, onSubmit, saving, testID, compact }: {
  exerciseId: string; exerciseName: string; current?: { value: number; unit: 'kg' | 'lb'; source: 'tested' | 'estimated'; updatedAt?: string };
  defaultUnit: 'kg' | 'lb'; onSubmit: (profile: BuildIntensityProfileInput) => void; saving?: boolean; testID: string; compact?: boolean;
}) {
  const c = useColors();
  const [value, setValue] = useState(current ? String(current.value) : '');
  const [unit, setUnit] = useState<'kg' | 'lb'>(current?.unit ?? defaultUnit);
  const [source, setSource] = useState<'tested' | 'estimated'>(current?.source ?? 'tested');
  const [error, setError] = useState('');
  const submit = () => {
    const n = Number(value.trim());
    if (!value.trim() || !Number.isFinite(n) || n <= 0 || n > 5000) { setError('1RM must be a number greater than 0 and up to 5000.'); return; }
    setError('');
    onSubmit({ exerciseId, value: n, unit, source });
  };
  return <View style={[sh.ormBox, { borderColor: c.border, backgroundColor: c.card }]}>
    {!compact ? <Text style={[sh.ormName, { color: c.foreground }]} numberOfLines={1}>{exerciseName}</Text> : null}
    {current ? <Text style={[sh.ormMeta, { color: c.mutedForeground }]}>
      Current {fmtNum(current.value)} {current.unit} · {current.source}{current.updatedAt ? ` · ${new Date(current.updatedAt).toLocaleDateString()}` : ''}
    </Text> : <Text style={[sh.ormMeta, { color: c.warning }]}>No 1RM yet. Enter a tested max or an estimate to calculate loads.</Text>}
    <View style={sh.ormRow}>
      <TextInput testID={`${testID}-value`} accessibilityLabel={`${exerciseName} one rep max`} value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="1RM"
        placeholderTextColor={c.mutedForeground} style={[sh.input, { flex: 1, color: c.foreground, borderColor: error ? c.destructive : c.border, backgroundColor: c.background }]} />
      <Segmented testID={`${testID}-unit`} label="1RM unit" value={unit} onChange={setUnit} options={[{ key: 'lb', label: 'lb' }, { key: 'kg', label: 'kg' }]} />
    </View>
    <Segmented testID={`${testID}-source`} label="1RM source" value={source} onChange={setSource} options={[{ key: 'tested', label: 'Tested' }, { key: 'estimated', label: 'Estimated' }]} />
    {error ? <Text accessibilityRole="alert" style={[sh.err, { color: c.destructive }]}>{error}</Text> : null}
    <View style={{ marginTop: 8 }}><Btn label={current ? 'Update 1RM' : 'Save 1RM'} onPress={submit} loading={saving} disabled={saving} testID={`${testID}-save`} /></View>
  </View>;
}

export const sh = StyleSheet.create({
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, marginBottom: 8 },
  segBtn: { flex: 1, minHeight: 34, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  miniRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 5 },
  mini: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 40, paddingHorizontal: 10, fontFamily: 'Inter_500Medium', fontSize: 14 },
  err: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 4 },
  ormBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
  ormName: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  ormMeta: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 2, marginBottom: 6 },
  ormRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
});
