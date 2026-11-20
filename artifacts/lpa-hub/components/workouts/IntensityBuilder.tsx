import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_RPE_CHART, INTENSITY_METHODS, getGetBuildAssignmentsQueryKey, getGetBuildIntensityConfigQueryKey, getGetCoachBuildIntensityQueryKey,
  intensityRange, prescribeIntensity, rirToRpe, rpeToRir,
  useGetBuildAssignments, useGetBuildIntensityConfig, useGetCoachBuildIntensity, useUpdateBuildIntensityConfig, useUpdateCoachBuildIntensity,
} from '@workspace/api-client-react';
import type {
  BuildIntensityPreferences, BuildIntensityProfileInput, BuildRpeChartRow, IntensityMethod, ProgramBuilderWorkoutExerciseInput,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { LpaIcon as Icon } from '@/components/LpaIcon';
import { Body, Btn, ErrorBox, SearchBox, Sheet, Skeleton } from '@/components/metrics/ui';
import { GuideLink, InfoTip } from '@/components/workouts/IntensityGuide';
import {
  METHOD_LABEL, METHOD_LONG, MiniLabel, OneRepMaxForm, PreferencesForm, Segmented, defaultPreferences, errorText, fmtNum, fmtRange, withTestedConfirm,
} from '@/components/workouts/IntensityShared';

type Item = ProgramBuilderWorkoutExerciseInput;
type Kind = 'percent' | 'rpe' | 'rir';
const KIND_LABEL: Record<Kind, string> = { percent: '% 1RM', rpe: 'RPE', rir: 'RIR' };
const KIND_HINT: Record<Kind, string> = { percent: '1–120', rpe: '5–10', rir: '0–5' };

const kindsFor = (method: IntensityMethod | undefined, item: Item): Kind[] => {
  if (!method) return (['percent', 'rpe', 'rir'] as Kind[]).filter((k) => item.setValues.some((v) => v.property === k && v.value));
  return method === 'percentage' ? ['percent'] : method === 'rpe' ? ['rpe'] : method === 'rir' ? ['rir']
    : method === 'percentage_plus_rpe' ? ['percent', 'rpe'] : ['percent', 'rir'];
};
const getV = (item: Item, n: number, p: string) => item.setValues.find((v) => v.setNumber === n && v.property === p)?.value ?? '';
const setV = (item: Item, n: number, p: Kind, value: string): Item => {
  const rest = item.setValues.filter((v) => !(v.setNumber === n && v.property === p));
  return { ...item, setValues: value === '' ? rest : [...rest, { setNumber: n, property: p, value }] };
};
const split = (value: string) => { const [min = '', max = ''] = value.replace(/[–—]/g, '-').split('-'); return { min: min.trim(), max: max.trim() }; };
const join = (min: string, max: string) => (!min && !max ? '' : max && max !== min ? `${min}-${max}` : min || `-${max}`);
const convertEffort = (value: string, to: 'rpe' | 'rir') => {
  try {
    const r = intensityRange(value, to === 'rir' ? 'rpe' : 'rir'); if (!r) return '';
    const conv = to === 'rir' ? rpeToRir : rirToRpe;
    const a = conv(r.max); const b = conv(r.min);
    if (to === 'rir' && (!Number.isInteger(a) || !Number.isInteger(b))) return '';
    return a === b ? String(a) : `${a}-${b}`;
  } catch { return ''; }
};

/** Sets the method and keeps setValues coherent: converts RPE <-> RIR targets, drops targets the method no longer uses. */
export function applyMethodToItem(item: Item, method: IntensityMethod | null): Item {
  const options = { ...item.options };
  if (method) options.intensityMethod = method; else delete options.intensityMethod;
  if (!method) return { ...item, options, setValues: item.setValues.filter((v) => !['percent', 'rpe', 'rir'].includes(v.property)) };
  const keep = kindsFor(method, item);
  let next: Item = { ...item, options };
  const effortTo = keep.includes('rir') ? 'rir' : keep.includes('rpe') ? 'rpe' : null;
  if (effortTo) {
    const from: Kind = effortTo === 'rir' ? 'rpe' : 'rir';
    for (let n = 1; n <= item.sets; n += 1) {
      const old = getV(item, n, from);
      if (old && !getV(item, n, effortTo)) next = setV(next, n, effortTo, convertEffort(old, effortTo));
    }
  }
  return { ...next, setValues: next.setValues.filter((v) => !(['percent', 'rpe', 'rir'] as string[]).includes(v.property) || keep.includes(v.property as Kind)) };
}

export function useCoachIntensity(athleteId: string) {
  return useGetCoachBuildIntensity(athleteId, { query: { enabled: !!athleteId, queryKey: getGetCoachBuildIntensityQueryKey(athleteId) } });
}

function useSaveProfile(athleteId: string) {
  const client = useQueryClient();
  const update = useUpdateCoachBuildIntensity();
  const [error, setError] = useState('');
  const save = async (profile?: BuildIntensityProfileInput, preferences?: BuildIntensityPreferences) => {
    setError('');
    try {
      const result = await withTestedConfirm((confirmTestedOverwrite) =>
        update.mutateAsync({ athleteId, data: { ...(profile ? { profile } : {}), ...(preferences ? { preferences } : {}), ...(confirmTestedOverwrite ? { confirmTestedOverwrite } : {}) } }));
      if (result) client.setQueryData(getGetCoachBuildIntensityQueryKey(athleteId), result);
      return !!result;
    } catch (e) { setError(errorText(e)); return false; }
  };
  return { save, saving: update.isPending, error };
}

/** Exercise-row intensity editor. Persists targets through the existing setValues grid (percent / rpe / rir). */
export function IntensityEditor({ item, exerciseName, athleteId, athleteName, onChange }: {
  item: Item; exerciseName: string; athleteId: string; athleteName: string; onChange: (transform: (item: Item) => Item) => void;
}) {
  const c = useColors();
  const method = item.options.intensityMethod ?? undefined;
  const kinds = kindsFor(method, item);
  const state = useCoachIntensity(athleteId);
  const prefs = state.data?.preferences ?? defaultPreferences();
  const chart = state.data?.chart ?? DEFAULT_RPE_CHART;
  const profile = state.data?.profiles.find((p) => p.exerciseId === item.exerciseId);
  const { save, saving, error: saveError } = useSaveProfile(athleteId);
  const [showOrm, setShowOrm] = useState(false);

  const errors = useMemo(() => {
    const list = new Set<string>();
    for (const k of kinds) for (let n = 1; n <= item.sets; n += 1) {
      try { intensityRange(getV(item, n, k), k); } catch (e) { list.add(errorText(e)); }
    }
    return [...list];
  }, [item, kinds]);
  const previews = useMemo(() => Array.from({ length: item.sets }, (_, i) => {
    try { return prescribeIntensity(item, i + 1, profile, prefs, chart); } catch { return null; }
  }), [item, profile, prefs, chart]);
  const missing = previews.some((p) => p?.missingOneRepMax);
  const hasPercent = previews.some((p) => p?.suggestedPercent);

  return <View style={[ib.box, { borderColor: c.border, backgroundColor: c.card }]}>
    <View style={ib.head}>
      <Icon name="clock" size={13} color={c.primary} />
      <Text style={[ib.headText, { color: c.foreground }]}>INTENSITY</Text>
      <InfoTip section="choose" testID={`intensity-info-method-${item.id}`} />
      <View style={{ flex: 1 }} />
      {method ? <Text style={[ib.methodNow, { color: c.mutedForeground }]}>{METHOD_LONG[method]}</Text> : null}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={`Intensity method for ${exerciseName}`}>
      <View style={ib.chips}>
        {([null, ...INTENSITY_METHODS] as (IntensityMethod | null)[]).map((m) => {
          const on = (method ?? null) === m;
          return <Pressable key={m ?? 'none'} testID={`intensity-method-${item.id}-${m ?? 'none'}`} accessibilityRole="radio" accessibilityState={{ checked: on }}
            accessibilityLabel={m ? METHOD_LONG[m] : 'No intensity method'} onPress={() => onChange((cur) => applyMethodToItem(cur, m))}
            style={[ib.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent' }]}>
            <Text style={[ib.chipText, { color: on ? c.primaryForeground : c.foreground }]}>{m ? METHOD_LABEL[m] : 'None'}</Text>
          </Pressable>;
        })}
      </View>
    </ScrollView>
    {kinds.map((k) => <View key={k} style={ib.row}>
      <View style={ib.rowHead}>
        <Text style={[ib.kind, { color: c.foreground }]}>{KIND_LABEL[k]}</Text>
        <InfoTip section={k} testID={`intensity-info-${k}-${item.id}`} />
      </View>
      {Array.from({ length: item.sets }, (_, i) => {
        const n = i + 1; const { min, max } = split(getV(item, n, k));
        let bad = false; try { intensityRange(getV(item, n, k), k); } catch { bad = true; }
        const border = bad ? c.destructive : c.border;
        const write = (a: string, b: string) => onChange((cur) => setV(cur, n, k, join(a.trim(), b.trim())));
        return <View key={n} style={ib.cell}>
          <TextInput testID={`intensity-${k}-min-${item.id}-${n}`} accessibilityLabel={`${KIND_LABEL[k]} minimum, set ${n}`} value={min}
            onChangeText={(t) => write(t, max)} keyboardType="decimal-pad" placeholder={k === 'percent' ? '75' : k === 'rpe' ? '7' : '2'} placeholderTextColor={c.mutedForeground}
            style={[ib.input, { borderColor: border, color: c.foreground, backgroundColor: c.background }]} />
          <TextInput testID={`intensity-${k}-max-${item.id}-${n}`} accessibilityLabel={`${KIND_LABEL[k]} maximum, set ${n}, optional`} value={max}
            onChangeText={(t) => write(min, t)} keyboardType="decimal-pad" placeholder="max" placeholderTextColor={c.mutedForeground}
            style={[ib.input, { borderColor: border, color: c.foreground, backgroundColor: c.background }]} />
        </View>;
      })}
    </View>)}
    {kinds.length ? <View style={ib.toolsRow}>
      <Text style={[ib.hint, { color: c.mutedForeground }]}>Top = min, bottom = optional max. {kinds.map((k) => `${KIND_LABEL[k]} ${KIND_HINT[k]}`).join(' · ')}</Text>
      {item.sets > 1 ? <Pressable testID={`intensity-copy-${item.id}`} accessibilityRole="button" onPress={() => onChange((cur) => {
        let next = cur;
        for (const k of kinds) { const first = getV(cur, 1, k); for (let n = 2; n <= cur.sets; n += 1) next = setV(next, n, k, first); }
        return next;
      })}><Text style={[ib.link, { color: c.accent }]}>Set 1 to all</Text></Pressable> : null}
    </View> : <Text style={[ib.hint, { color: c.mutedForeground }]}>Choose a method to prescribe % of 1RM, RPE, RIR, or a combination.</Text>}
    {errors.map((e) => <Text key={e} accessibilityRole="alert" style={[ib.err, { color: c.destructive }]}>{e}</Text>)}

    {kinds.length ? !athleteId ? <Text style={[ib.hint, { color: c.mutedForeground, marginTop: 6 }]}>Pick a preview athlete above to see calculated loads.</Text>
      : state.isLoading ? <Text style={[ib.hint, { color: c.mutedForeground, marginTop: 6 }]}>Loading {athleteName}'s 1RMs…</Text>
        : state.isError ? <Pressable onPress={() => void state.refetch()}><Text style={[ib.err, { color: c.destructive }]}>Could not load 1RMs. Tap to retry.</Text></Pressable>
          : <View style={[ib.preview, { borderColor: c.border }]}>
            <View style={ib.rowHead}><Text style={[ib.kind, { color: c.primary }]}>LOAD</Text></View>
            {previews.map((p, i) => <View key={i} style={ib.loadCell}>
              <Text numberOfLines={2} style={[ib.loadText, { color: p?.load != null ? c.foreground : c.mutedForeground }]}>
                {p?.loadMin != null ? fmtRange(p.loadMin, p.loadMax) : p?.load != null ? fmtNum(p.load) : '—'}
              </Text>
              {p?.suggestedPercent && !p.percent ? <Text style={[ib.chartNote, { color: c.mutedForeground }]}>{fmtRange(p.suggestedPercent.min, p.suggestedPercent.max, '%')}</Text> : null}
            </View>)}
          </View> : null}
    {athleteId && kinds.length && !state.isLoading && !state.isError ? <Text style={[ib.hint, { color: c.mutedForeground }]}>
      {athleteName} · {profile ? `1RM ${fmtNum(profile.value)} ${profile.unit} (${profile.source})` : 'no 1RM'} · loads in {prefs.unit}, rounded to {prefs.roundingIncrement}{hasPercent && !kinds.includes('percent') ? ' · % from RPE chart' : ''}
    </Text> : null}
    {athleteId && missing ? <Text accessibilityRole="alert" style={[ib.warn, { color: c.warning }]}>
      {athleteName} needs a 1RM for {exerciseName} before percentage loads can calculate. Enter a tested max or an estimate.
    </Text> : null}
    {athleteId && kinds.length && !state.isLoading && !state.isError ? <Pressable testID={`intensity-orm-toggle-${item.id}`} accessibilityRole="button" onPress={() => setShowOrm((v) => !v)}>
      <Text style={[ib.link, { color: c.accent, marginTop: 6 }]}>{showOrm ? 'Hide 1RM entry' : profile ? 'Edit 1RM' : 'Enter or estimate 1RM'}</Text>
    </Pressable> : null}
    {showOrm && athleteId ? <OneRepMaxForm key={`${athleteId}-${profile?.updatedAt ?? 'none'}`} compact exerciseId={item.exerciseId} exerciseName={exerciseName}
      current={profile} defaultUnit={prefs.unit} saving={saving} testID={`intensity-orm-${item.id}`}
      onSubmit={(p) => void save(p).then((ok) => { if (ok) setShowOrm(false); })} /> : null}
    {saveError ? <Text accessibilityRole="alert" style={[ib.err, { color: c.destructive }]}>{saveError}</Text> : null}
  </View>;
}

/** Editor toolbar: preview athlete, bulk apply, settings, guide. */
export function IntensityToolbar({ athleteId, onAthleteChange, onBulkApply, exercises, dayName, weekName }: {
  athleteId: string; onAthleteChange: (id: string, name: string) => void;
  onBulkApply: (method: IntensityMethod | null, scope: 'day' | 'week') => void;
  exercises: { id: string; name: string }[]; dayName: string; weekName: string;
}) {
  const c = useColors();
  const [pickOpen, setPickOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkMethod, setBulkMethod] = useState<IntensityMethod | null>('percentage');
  const [bulkScope, setBulkScope] = useState<'day' | 'week'>('day');
  const [search, setSearch] = useState('');
  const roster = useGetBuildAssignments({ query: { queryKey: getGetBuildAssignmentsQueryKey() } });
  const athletes = (roster.data?.athletes ?? []).filter((a) => a.displayName.toLowerCase().includes(search.trim().toLowerCase()));
  const current = roster.data?.athletes.find((a) => a.id === athleteId);

  return <View style={[ib.toolbar, { borderColor: c.border, backgroundColor: c.card }]}>
    <Pressable testID="intensity-preview-athlete" accessibilityRole="button" accessibilityLabel="Choose preview athlete" onPress={() => setPickOpen(true)} style={[ib.tool, { borderColor: athleteId ? c.primary : c.border }]}>
      <Icon name="users" size={13} color={athleteId ? c.primary : c.mutedForeground} />
      <Text numberOfLines={1} style={[ib.toolText, { color: athleteId ? c.primary : c.foreground }]}>{current ? `Preview: ${current.displayName}` : 'Preview athlete'}</Text>
    </Pressable>
    <Pressable testID="intensity-bulk-open" accessibilityRole="button" onPress={() => setBulkOpen(true)} style={[ib.tool, { borderColor: c.border }]}>
      <Icon name="layout" size={13} color={c.foreground} /><Text style={[ib.toolText, { color: c.foreground }]}>Bulk intensity</Text>
    </Pressable>
    <Pressable testID="intensity-settings-open" accessibilityRole="button" onPress={() => setSettingsOpen(true)} style={[ib.tool, { borderColor: c.border }]}>
      <Icon name="grid" size={13} color={c.foreground} /><Text style={[ib.toolText, { color: c.foreground }]}>1RM & chart</Text>
    </Pressable>
    <GuideLink testID="intensity-guide-builder" />

    <Sheet visible={pickOpen} title="Preview loads for" onClose={() => setPickOpen(false)}>
      <SearchBox value={search} onChange={setSearch} placeholder="Search athletes" testID="intensity-athlete-search" />
      {roster.isLoading ? <Skeleton h={60} /> : roster.isError ? <ErrorBox message="Athletes could not load." onRetry={() => void roster.refetch()} /> : <>
        {athleteId ? <Pressable testID="intensity-athlete-clear" accessibilityRole="button" onPress={() => { onAthleteChange('', ''); setPickOpen(false); }} style={[ib.pickRow, { borderBottomColor: c.border }]}>
          <Text style={[ib.pickText, { color: c.mutedForeground }]}>No preview athlete</Text>
        </Pressable> : null}
        {athletes.map((a) => <Pressable key={a.id} testID={`intensity-athlete-${a.id}`} accessibilityRole="radio" accessibilityState={{ checked: a.id === athleteId }}
          onPress={() => { onAthleteChange(a.id, a.displayName); setPickOpen(false); }} style={[ib.pickRow, { borderBottomColor: c.border }]}>
          <Text style={[ib.pickText, { color: a.id === athleteId ? c.primary : c.foreground }]}>{a.displayName}</Text>
          {a.id === athleteId ? <Icon name="check" size={14} color={c.primary} /> : null}
        </Pressable>)}
        {!athletes.length ? <Body muted>No athletes match.</Body> : null}
      </>}
    </Sheet>

    <Sheet visible={bulkOpen} title="Bulk apply intensity method" onClose={() => setBulkOpen(false)}>
      <Body muted>Sets the method on every exercise in the chosen scope. Existing RPE targets convert to RIR (and back) where possible; targets the new method does not use are cleared.</Body>
      <MiniLabel tip="choose">Method</MiniLabel>
      <View style={ib.chipsWrap}>{([null, ...INTENSITY_METHODS] as (IntensityMethod | null)[]).map((m) => {
        const on = bulkMethod === m;
        return <Pressable key={m ?? 'none'} testID={`intensity-bulk-method-${m ?? 'none'}`} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setBulkMethod(m)}
          style={[ib.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent' }]}>
          <Text style={[ib.chipText, { color: on ? c.primaryForeground : c.foreground }]}>{m ? METHOD_LONG[m] : 'Clear method'}</Text>
        </Pressable>;
      })}</View>
      <MiniLabel>Apply to</MiniLabel>
      <Segmented testID="intensity-bulk-scope" label="Bulk scope" value={bulkScope} onChange={setBulkScope}
        options={[{ key: 'day', label: `Workout · ${dayName}` }, { key: 'week', label: `Week · ${weekName}` }]} />
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn label="Cancel" kind="ghost" onPress={() => setBulkOpen(false)} testID="intensity-bulk-cancel" />
        <Btn label="Apply" onPress={() => { onBulkApply(bulkMethod, bulkScope); setBulkOpen(false); }} testID="intensity-bulk-apply" />
      </View>
    </Sheet>

    <IntensitySettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} athleteId={athleteId} athleteName={current?.displayName ?? ''} exercises={exercises} />
  </View>;
}

function IntensitySettingsSheet({ visible, onClose, athleteId, athleteName, exercises }: {
  visible: boolean; onClose: () => void; athleteId: string; athleteName: string; exercises: { id: string; name: string }[];
}) {
  const [tab, setTab] = useState<'athlete' | 'chart'>(athleteId ? 'athlete' : 'chart');
  return <Sheet visible={visible} title="Intensity settings" onClose={onClose}>
    <Segmented testID="intensity-settings-tab" label="Settings section" value={tab} onChange={setTab}
      options={[{ key: 'athlete', label: athleteName ? `${athleteName}` : 'Athlete 1RMs' }, { key: 'chart', label: 'RPE chart' }]} />
    {tab === 'athlete' ? athleteId ? <AthleteIntensityPanel athleteId={athleteId} athleteName={athleteName} exercises={exercises} />
      : <Body muted>Pick a preview athlete in the toolbar to enter 1RMs and set their preferences.</Body> : <ChartEditor />}
  </Sheet>;
}

function AthleteIntensityPanel({ athleteId, athleteName, exercises }: { athleteId: string; athleteName: string; exercises: { id: string; name: string }[] }) {
  const state = useCoachIntensity(athleteId);
  const { save, saving, error } = useSaveProfile(athleteId);
  const c = useColors();
  if (state.isLoading) return <Skeleton h={120} />;
  if (state.isError || !state.data) return <ErrorBox message="1RMs could not load." onRetry={() => void state.refetch()} />;
  const data = state.data;
  return <View>
    {error ? <Text accessibilityRole="alert" style={[ib.err, { color: c.destructive }]}>{error}</Text> : null}
    <MiniLabel tip="percent">{`${athleteName} · 1RM by exercise`}</MiniLabel>
    {exercises.length ? exercises.map((e) => {
      const p = data.profiles.find((x) => x.exerciseId === e.id);
      return <OneRepMaxForm key={`${e.id}-${p?.updatedAt ?? 'none'}`} exerciseId={e.id} exerciseName={e.name} current={p} defaultUnit={data.preferences.unit}
        saving={saving} testID={`settings-orm-${e.id}`} onSubmit={(profile) => void save(profile)} />;
    }) : <Body muted>Add exercises to this program to record 1RMs.</Body>}
    <MiniLabel>{`${athleteName} · preferences`}</MiniLabel>
    <PreferencesForm key={JSON.stringify(data.preferences)} value={data.preferences} saving={saving} testID="settings-prefs" onSave={(prefs) => void save(undefined, prefs)} />
  </View>;
}

function ChartEditor() {
  const c = useColors();
  const client = useQueryClient();
  const config = useGetBuildIntensityConfig({ query: { queryKey: getGetBuildIntensityConfigQueryKey() } });
  const update = useUpdateBuildIntensityConfig();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  if (config.isLoading) return <Skeleton h={200} />;
  if (config.isError || !config.data) return <ErrorBox message="The RPE chart could not load." onRetry={() => void config.refetch()} />;
  const chart = config.data.chart;
  const reps = [...new Set(chart.map((r) => r.reps))].sort((a, b) => a - b);
  const rpes = [...new Set(chart.map((r) => r.rpe))].sort((a, b) => b - a);
  const key = (r: number, e: number) => `${r}|${e}`;
  const cell = (r: number, e: number) => edits[key(r, e)] ?? fmtNum(chart.find((x) => x.reps === r && x.rpe === e)?.percentage);
  const submit = async () => {
    const next: BuildRpeChartRow[] = [];
    for (const r of reps) for (const e of rpes) {
      const raw = cell(r, e); if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 120) { setError(`${r} reps @ RPE ${e}: percentage must be 1–120.`); return; }
      next.push({ reps: r, rpe: e, percentage: n });
    }
    if (!next.length) { setError('The chart needs at least one value.'); return; }
    setError('');
    try {
      const result = await update.mutateAsync({ data: { chart: next } });
      client.setQueryData(getGetBuildIntensityConfigQueryKey(), result);
      void client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/metrics/build-intensity/athletes/') });
      setEdits({}); setSaved(true);
    } catch (e) { setError(errorText(e)); }
  };
  return <View>
    <Body muted>Suggested % of 1RM for a rep count at an RPE. Used when a set has an RPE or RIR target but no percentage. Changes apply to upcoming sessions only; logged sets keep their saved values.</Body>
    <ScrollView horizontal>
      <View>
        <View style={ib.chartRow}>
          <Text style={[ib.chartHead, { color: c.mutedForeground, width: 46 }]}>REPS</Text>
          {rpes.map((e) => <Text key={e} style={[ib.chartHead, { color: c.mutedForeground }]}>RPE {e}</Text>)}
        </View>
        {reps.map((r) => <View key={r} style={ib.chartRow}>
          <Text style={[ib.chartHead, { color: c.foreground, width: 46 }]}>{r}</Text>
          {rpes.map((e) => <TextInput key={e} testID={`chart-${r}-${e}`} accessibilityLabel={`${r} reps at RPE ${e}, percent of 1RM`} value={cell(r, e)}
            onChangeText={(t) => { setSaved(false); setEdits((old) => ({ ...old, [key(r, e)]: t })); }} keyboardType="decimal-pad"
            style={[ib.chartInput, { color: c.foreground, borderColor: edits[key(r, e)] != null ? c.accent : c.border, backgroundColor: c.background }]} />)}
        </View>)}
      </View>
    </ScrollView>
    {error ? <Text accessibilityRole="alert" style={[ib.err, { color: c.destructive }]}>{error}</Text> : null}
    {saved ? <Text style={[ib.hint, { color: c.primary }]}>Chart saved.</Text> : null}
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
      <Btn label="Discard edits" kind="ghost" disabled={!Object.keys(edits).length} onPress={() => setEdits({})} testID="chart-discard" />
      <Btn label="Save chart" onPress={() => void submit()} loading={update.isPending} disabled={update.isPending || !Object.keys(edits).length} testID="chart-save" />
    </View>
  </View>;
}

const ib = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 10, padding: 9, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  headText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  methodNow: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  chips: { flexDirection: 'row', gap: 5, paddingBottom: 4 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, minHeight: 30, justifyContent: 'center' },
  chipText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  rowHead: { width: 73, flexDirection: 'row', alignItems: 'center' },
  kind: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  cell: { flex: 1, minWidth: 0, gap: 3 },
  input: { height: 28, borderWidth: 1, borderRadius: 7, textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 11, paddingHorizontal: 2 },
  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 10, flex: 1, lineHeight: 14, marginTop: 2 },
  link: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  err: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 4 },
  warn: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 6, lineHeight: 15 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  loadCell: { flex: 1, minWidth: 0, alignItems: 'center' },
  loadText: { fontFamily: 'Inter_700Bold', fontSize: 11, textAlign: 'center' },
  chartNote: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, padding: 8, marginBottom: 8 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, minHeight: 32, maxWidth: 220 },
  toolText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  pickText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  chartHead: { width: 54, fontFamily: 'Inter_700Bold', fontSize: 10, textAlign: 'center' },
  chartInput: { width: 54, height: 30, borderWidth: 1, borderRadius: 6, textAlign: 'center', fontSize: 11, fontFamily: 'Inter_500Medium' },
});
