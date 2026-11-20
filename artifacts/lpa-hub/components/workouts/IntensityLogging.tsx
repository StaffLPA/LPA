import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { convertLoad, prescribeIntensity, rirToRpe, rpeToRir } from '@workspace/api-client-react';
import type { BuildIntensityPreferences, BuildIntensitySnapshot, BuildWorkoutLog } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { LpaIcon as Icon } from '@/components/LpaIcon';
import { Sheet } from '@/components/metrics/ui';
import { InfoTip } from '@/components/workouts/IntensityGuide';
import { PreferencesForm, fmtNum, fmtRange } from '@/components/workouts/IntensityShared';

export type Prescription = ReturnType<typeof prescribeIntensity>;
const RPE_OPTIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const RIR_OPTIONS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5, 0];
const PCT_FLAG = 5; // percentage points away from target that counts as "notably" off

/** Converts a tapped value on either scale into both stored values (RIR = 10 - RPE, half steps allowed). */
export function effortPair(scale: 'rpe' | 'rir', value: number | null) {
  if (value == null) return { rpe: '', rir: '' };
  const rpe = scale === 'rpe' ? value : rirToRpe(value);
  const rir = rpeToRir(rpe);
  return { rpe: String(rpe), rir: String(rir) };
}

export function EffortPicker({ scale, rpe, onChange, onToggleScale, testID, cap }: {
  scale: 'rpe' | 'rir'; rpe: string; onChange: (pair: { rpe: string; rir: string }) => void; onToggleScale: () => void; testID: string; cap?: number | null;
}) {
  const c = useColors();
  const current = rpe ? Number(rpe) : null;
  const options = scale === 'rpe' ? RPE_OPTIONS : RIR_OPTIONS;
  const selectedValue = current == null ? null : scale === 'rpe' ? current : rpeToRir(current);
  return <View style={lg.effort}>
    <View style={lg.effortHead}>
      <Text style={[lg.inLabel, { color: c.mutedForeground }]}>{scale === 'rpe' ? 'HOW HARD · RPE' : 'REPS LEFT · RIR'}</Text>
      <InfoTip section={scale} testID={`${testID}-info`} />
      <View style={{ flex: 1 }} />
      <Pressable testID={`${testID}-toggle`} accessibilityRole="switch" accessibilityState={{ checked: scale === 'rir' }}
        accessibilityLabel={`Show effort as ${scale === 'rpe' ? 'reps in reserve' : 'RPE'}`} onPress={onToggleScale} hitSlop={6}
        style={[lg.toggle, { borderColor: c.border }]}>
        <Text style={[lg.toggleText, { color: scale === 'rpe' ? c.primary : c.mutedForeground }]}>RPE</Text>
        <Text style={{ color: c.border }}>/</Text>
        <Text style={[lg.toggleText, { color: scale === 'rir' ? c.primary : c.mutedForeground }]}>RIR</Text>
      </Pressable>
    </View>
    <View accessibilityRole="radiogroup" accessibilityLabel={scale === 'rpe' ? 'Actual RPE' : 'Actual reps in reserve'} style={lg.effortRow}>
      {options.map((o) => {
        const on = selectedValue === o;
        const asRpe = scale === 'rpe' ? o : rirToRpe(o);
        const over = cap != null && asRpe > cap;
        return <Pressable key={o} testID={`${testID}-${o}`} accessibilityRole="radio" accessibilityState={{ checked: on }}
          accessibilityLabel={scale === 'rpe' ? `RPE ${o}` : `${o} reps in reserve`}
          onPress={() => onChange(on ? effortPair(scale, null) : effortPair(scale, o))}
          style={[lg.effortBtn, {
            borderColor: on ? (over ? c.warning : c.primary) : c.border,
            backgroundColor: on ? (over ? c.warning : c.primary) : c.background,
          }]}>
          <Text style={[lg.effortText, { color: on ? c.primaryForeground : over ? c.warning : c.foreground }]}>{fmtNum(o)}</Text>
        </Pressable>;
      })}
    </View>
    {current != null ? <Text style={[lg.sync, { color: c.mutedForeground }]}>
      Saved as RPE {fmtNum(current)} · RIR {fmtNum(rpeToRir(current))}
    </Text> : null}
  </View>;
}

/** Effort cap in RPE terms (RIR targets are converted), or null when no effort target. */
export const effortCap = (p: Pick<Prescription, 'rpe' | 'rir'> | null) => (p?.rpe ? p.rpe.max : p?.rir ? rirToRpe(p.rir.min) : null);
const snapshotCap = (s: BuildIntensitySnapshot) => (s.targetRpeMax != null ? s.targetRpeMax : s.targetRirMin != null ? rirToRpe(s.targetRirMin) : null);

/** Live prescription line for a set that has not been logged yet. */
export function prescriptionText(p: Prescription | null, scale: 'rpe' | 'rir') {
  if (!p) return '';
  const parts: string[] = [];
  const pct = p.percent ?? p.suggestedPercent;
  const load = p.loadMin != null ? fmtRange(p.loadMin, p.loadMax, ` ${p.unit}`) : p.load != null ? `${fmtNum(p.load)} ${p.unit}` : '';
  if (pct) parts.push(`${fmtRange(pct.min, pct.max, '%')}${p.percent ? '' : ' (chart)'}${load ? ` = ${load}` : ''}`);
  else if (load) parts.push(load);
  if (p.rpe) parts.push(scale === 'rir' ? `RIR ${fmtRange(rpeToRir(p.rpe.max), rpeToRir(p.rpe.min))}` : `RPE ${fmtRange(p.rpe.min, p.rpe.max)}`);
  else if (p.rir) parts.push(scale === 'rpe' ? `RPE ${fmtRange(rirToRpe(p.rir.max), rirToRpe(p.rir.min))}` : `RIR ${fmtRange(p.rir.min, p.rir.max)}`);
  return parts.join(', ');
}

/** Prescription line from the SAVED snapshot of a logged set. Never recalculated with the current 1RM. */
export function snapshotText(s: BuildIntensitySnapshot, scale: 'rpe' | 'rir') {
  const parts: string[] = [];
  const unit = s.unit ?? '';
  const pct = fmtRange(s.targetPercentageMin, s.targetPercentageMax, '%');
  const load = s.calculatedLoad != null ? `${fmtNum(s.calculatedLoad)} ${unit}`.trim() : '';
  if (pct) parts.push(load ? `${pct} = ${load}` : pct); else if (load) parts.push(load);
  if (s.targetRpeMin != null || s.targetRpeMax != null) parts.push(scale === 'rir' && s.targetRpeMax != null && s.targetRpeMin != null
    ? `RIR ${fmtRange(rpeToRir(s.targetRpeMax), rpeToRir(s.targetRpeMin))}` : `RPE ${fmtRange(s.targetRpeMin, s.targetRpeMax)}`);
  else if (s.targetRirMin != null || s.targetRirMax != null) parts.push(scale === 'rpe' && s.targetRirMin != null && s.targetRirMax != null
    ? `RPE ${fmtRange(rirToRpe(s.targetRirMax), rirToRpe(s.targetRirMin))}` : `RIR ${fmtRange(s.targetRirMin, s.targetRirMax)}`);
  return parts.join(', ');
}

function Flag({ tone, text, icon }: { tone: 'ok' | 'warn' | 'info'; text: string; icon: string }) {
  const c = useColors();
  const color = tone === 'warn' ? c.warning : tone === 'ok' ? c.primary : c.mutedForeground;
  return <View accessibilityRole={tone === 'warn' ? 'alert' : 'text'} style={lg.flag}>
    <Icon name={icon as never} size={12} color={color} /><Text style={[lg.flagText, { color }]}>{text}</Text>
  </View>;
}

/** Result of a saved set: actual % of 1RM from the snapshot, distance from target, and the gentle effort-cap note. */
export function SavedSetFeedback({ log, scale }: { log: BuildWorkoutLog; scale: 'rpe' | 'rir' }) {
  const s = log.intensity; if (!s) return null;
  const items: React.ReactNode[] = [];
  if (s.actualPercentage != null) {
    const min = s.targetPercentageMin; const max = s.targetPercentageMax ?? min;
    const off = min != null && max != null ? (s.actualPercentage > max + PCT_FLAG ? 'above' : s.actualPercentage < min - PCT_FLAG ? 'below' : null) : null;
    items.push(<Flag key="pct" tone={off ? 'warn' : 'info'} icon={off ? 'alert-circle' : 'circle'}
      text={`Logged at ${fmtNum(s.actualPercentage)}% of 1RM${s.oneRepMax != null ? ` (1RM ${fmtNum(s.oneRepMax)} ${s.unit ?? ''})`.trimEnd() : ''}${off ? ` · notably ${off} the ${fmtRange(min, max, '%')} target` : ''}`} />);
  }
  if (s.actualRpe != null || s.actualRir != null) {
    const rpe = s.actualRpe ?? (s.actualRir != null ? rirToRpe(s.actualRir) : null);
    const label = scale === 'rir' ? `RIR ${fmtNum(s.actualRir ?? (rpe != null ? rpeToRir(rpe) : null))}` : `RPE ${fmtNum(rpe)}`;
    items.push(<Flag key="eff" tone="info" icon="clock" text={`Felt like ${label}`} />);
  }
  const cap = snapshotCap(s);
  const rpe = s.actualRpe ?? (s.actualRir != null ? rirToRpe(s.actualRir) : null);
  if (s.suggestion) items.push(<Flag key="sug" tone="warn" icon="alert-circle" text={s.suggestion} />);
  else if (cap != null && rpe != null && rpe > cap) items.push(<Flag key="cap" tone="warn" icon="alert-circle" text={`Above the effort cap. Consider taking a little weight off next set. Your program stays as written.`} />);
  return items.length ? <View>{items}</View> : null;
}

/** Live (unsaved) feedback while logging. */
export function LiveSetFeedback({ p, weight, unit, rpe }: { p: Prescription | null; weight: string; unit: 'kg' | 'lb'; rpe: string }) {
  if (!p) return null;
  const items: React.ReactNode[] = [];
  const w = Number(weight);
  if (weight.trim() && Number.isFinite(w) && w > 0 && p.oneRepMax) {
    const pct = (convertLoad(w, unit, p.unit) / p.oneRepMax) * 100;
    const target = p.percent ?? p.suggestedPercent;
    const off = target ? (pct > target.max + PCT_FLAG ? 'above' : pct < target.min - PCT_FLAG ? 'below' : null) : null;
    items.push(<Flag key="pct" tone={off ? 'warn' : 'info'} icon={off ? 'alert-circle' : 'circle'}
      text={`${fmtNum(pct)}% of 1RM${off && target ? ` · notably ${off} the ${fmtRange(target.min, target.max, '%')} target` : ''}`} />);
  }
  const cap = effortCap(p);
  if (cap != null && rpe && Number(rpe) > cap) items.push(<Flag key="cap" tone="warn" icon="alert-circle"
    text={`That felt harder than the RPE ${fmtNum(cap)} cap. Consider a little less weight next set.`} />);
  return items.length ? <View>{items}</View> : null;
}

export function MissingOneRepMaxNote({ name }: { name: string }) {
  return <Flag tone="warn" icon="alert-circle" text={`No 1RM on file for ${name}, so the percentage cannot become a load yet. Log a completed set with effort and tap "Use this set to estimate my 1RM", or ask your coach.`} />;
}

export function AthleteIntensitySheet({ visible, onClose, preferences, onSave, saving, error }: {
  visible: boolean; onClose: () => void; preferences: BuildIntensityPreferences; onSave: (p: BuildIntensityPreferences) => void; saving: boolean; error: string;
}) {
  const c = useColors();
  return <Sheet visible={visible} title="My intensity settings" onClose={onClose}>
    <Text style={[lg.sync, { color: c.mutedForeground, marginBottom: 4 }]}>Changing unit or rounding updates upcoming targets only. Logged sets keep what was saved.</Text>
    {error ? <Text accessibilityRole="alert" style={[lg.flagText, { color: c.destructive }]}>{error}</Text> : null}
    <PreferencesForm key={visible ? JSON.stringify(preferences) : 'closed'} value={preferences} onSave={onSave} saving={saving} testID="athlete-prefs" />
  </Sheet>;
}

const lg = StyleSheet.create({
  inLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  effort: { marginTop: 8 },
  effortHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, minHeight: 30 },
  toggleText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  effortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  effortBtn: { minWidth: 44, minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  effortBtnWide: { flexGrow: 1 },
  effortText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  sync: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 5 },
  flag: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  flagText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flex: 1, lineHeight: 16 },
});
