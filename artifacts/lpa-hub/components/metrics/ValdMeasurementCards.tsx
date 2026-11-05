import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGetValdMeasurements } from '@workspace/api-client-react';
import type { GetValdMeasurementsParams, ValdExerciseMeasurements, ValdMeasurementOption, ValdMeasurementsResponse } from '@workspace/api-client-react';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Btn, ErrorBox, SearchBox, Sheet, Skeleton } from './ui';
import { ValdMeasurementChart } from './ValdMeasurementChart';
import { MetricsWorkspace, POLL_MS, errMsg, fixed, fmtDate, fmtPct, groupSummaries, kpiOf } from '@/lib/metrics';
import { selectValdExercise } from '@/lib/valdMeasurementSelection';
import { useValdReportSelection } from '@/lib/valdReportSelection';

export const VALD_METRICS: Record<string, { id: 'cmj' | 'left' | 'right'; title: string; param: 'cmjMeasurement' | 'leftMeasurement' | 'rightMeasurement' }> = {
  'vald-cmj-jump-height': { id: 'cmj', title: 'Countermovement Jump', param: 'cmjMeasurement' },
  'vald-single-leg-jump-height-left': { id: 'left', title: 'Single Leg Jump - Left', param: 'leftMeasurement' },
  'vald-single-leg-jump-height-right': { id: 'right', title: 'Single Leg Jump - Right', param: 'rightMeasurement' },
};
export const isValdMetric = (id: string) => id in VALD_METRICS;

const unitSuffix = (u?: string | null) => (u && u.trim() ? ` ${u.trim()}` : '');
const optLabel = (o: ValdMeasurementOption) => `${o.name}${o.unit ? ` [${o.unit}]` : ''}${o.limb && !/^(trial|both)$/i.test(o.limb) ? ` · ${o.limb}` : ''}`;

export function ValdMeasurementCards({ ws, metricIds, label, width, renderGraph, showDetails }: { ws?: MetricsWorkspace; metricIds: string[]; label: string; width: string; renderGraph?: (metricId: string, unit: string, protocol?: string) => React.ReactNode; showDetails: boolean }) {
  const { user } = useApp();
  const params = useMemo(() => {
    const p: GetValdMeasurementsParams = { athleteIds: ws?.selectedAthleteIds.length ? ws.selectedAthleteIds.join(',') : 'none', includeAlternatives: 'true' };
    if (ws?.filters?.team) p.team = ws.filters.team;
    if (ws?.filters?.start) p.start = ws.filters.start;
    if (ws?.filters?.end) p.end = ws.filters.end;
    return p;
  }, [ws?.selectedAthleteIds.join(','), ws?.filters?.team, ws?.filters?.start, ws?.filters?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useGetValdMeasurements(params, { query: { queryKey: ['/api/metrics/vald/measurements', user?.id ?? 'anon', params], enabled: !!user && !!ws, refetchInterval: POLL_MS, refetchOnWindowFocus: true, staleTime: 10_000 } });
  const data = q.data;
  return <>{q.isError && data ? <View style={{ width: '100%' }}><ErrorBox message={`VALD refresh failed. Showing the last saved response. ${errMsg(q.error)}`} onRetry={() => q.refetch()} /></View> : null}{metricIds.map((mid) => {
    const def = VALD_METRICS[mid];
    return <View key={mid} testID={`kpi-vald-${def.id}`} style={{ width: width as never }}>
      <ValdExerciseCard ws={ws} metricId={mid} data={data} params={params} label={label}
        initialLoading={q.isLoading && !data} initialError={q.isError && !data ? q.error : undefined}
        onRefresh={() => q.refetch()} renderGraph={renderGraph} showDetails={showDetails} />
    </View>;
  })}</>;
}

function ValdExerciseCard({ ws, metricId, data, params, label, initialLoading, initialError, onRefresh, renderGraph, showDetails }: { ws?: MetricsWorkspace; metricId: string; data?: ValdMeasurementsResponse; params: GetValdMeasurementsParams; label: string; initialLoading: boolean; initialError?: unknown; onRefresh: () => Promise<unknown>; renderGraph?: (metricId: string, unit: string, protocol?: string) => React.ReactNode; showDetails: boolean }) {
  const { user } = useApp();
  const def = VALD_METRICS[metricId];
  const [reportSelection, setReportSelection] = useValdReportSelection();
  const picked = reportSelection[def.param];
  const setPicked = (id: string) => setReportSelection(def.param, id);
  const [refreshing, setRefreshing] = useState(false);
  // Older published APIs may not yet provide the bundle. In that case only
  // this card requests its selection; sibling cards retain their own data.
  const needsRequest = !!picked && data?.measurementAlternatives === undefined &&
    data?.exercises.find((e) => e.id === def.id)?.selectedMeasurementId !== picked;
  const selectionParams = { ...params, [def.param]: picked };
  const q = useGetValdMeasurements(selectionParams, { query: {
    queryKey: ['/api/metrics/vald/measurements', user?.id ?? 'anon', selectionParams],
    enabled: !!user && !!data && needsRequest, staleTime: 10_000,
    refetchInterval: needsRequest ? POLL_MS : false, refetchOnWindowFocus: true,
  } });
  const selectedData = needsRequest && q.data ? q.data : data;
  const ex = selectValdExercise(selectedData, def.id, picked);
  const pending = needsRequest && !q.data;
  // Keep the selection state mounted across roster/date changes without
  // displaying any values from the previous filter scope.
  if (initialLoading) return <Skeleton h={190} />;
  if (initialError) return <ErrorBox message={`${def.title}: ${errMsg(initialError)}`} onRetry={onRefresh} />;
  return <>
    {needsRequest && q.isError ? <ErrorBox message={`Could not load this measurement. ${errMsg(q.error)}`} onRetry={() => q.refetch()} /> : null}
    <ValdCard ws={ws} metricId={metricId} title={def.title} ex={ex} label={label}
      needsSync={!!data?.needsHistorySync} lastSyncedAt={data?.lastSyncedAt ?? null}
      requested={picked} fetching={refreshing || (needsRequest && q.isFetching)} pending={pending}
      onPick={setPicked} onRefresh={async () => {
        setRefreshing(true);
        try { if (needsRequest) await q.refetch(); else await onRefresh(); }
        finally { setRefreshing(false); }
      }} renderGraph={renderGraph} showDetails={showDetails} />
  </>;
}

function ValdCard({ ws, metricId, title, ex, label, needsSync, lastSyncedAt, requested, fetching, pending, onPick, onRefresh, renderGraph, showDetails }: { ws?: MetricsWorkspace; metricId: string; title: string; ex?: ValdExerciseMeasurements; label: string; needsSync: boolean; lastSyncedAt: string | null; requested?: string; fetching: boolean; pending: boolean; onPick: (id: string) => void; onRefresh: () => void; renderGraph?: (metricId: string, unit: string, protocol?: string) => React.ReactNode; showDetails: boolean }) {
  const c = useColors();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const options = ex?.options ?? [];
  const legacy = !options.length;
  const selected = options.find((o) => o.id === (pending ? requested : ex?.selectedMeasurementId)) ?? null;
  const fellBack = !pending && !!requested && !!ex && ex.selectedMeasurementId !== requested;
  const requestedName = requested ? options.find((o) => o.id === requested) : undefined;

  let big: string, prev: string, pct: number | null = null, unit = '', note: string, legacyUnit = '';
  if (legacy) {
    const g = groupSummaries(ws).find((x) => x.metric.id === metricId &&
      x.protocol.startsWith('VALD ') && x.summaries.some((summary) => summary.latest !== null));
    const k = g ? kpiOf(g, ws?.selectedAthleteIds.length ?? 0) : null;
    legacyUnit = g?.unit ?? '';
    big = fixed(k?.current ?? null, g?.metric.decimals); prev = fixed(k?.baseline ?? null, g?.metric.decimals); pct = k?.pct ?? null; unit = legacyUnit;
    note = k?.paired ? `Legacy Jump Height (Imp-Mom) only. ${k.paired} paired athlete${k.paired === 1 ? '' : 's'}.` : 'Legacy Jump Height (Imp-Mom) only.';
  } else {
    unit = selected?.unit ?? ex?.unit ?? '';
    big = pending ? '—' : fixed(ex?.groupAverage ?? null); prev = pending ? '—' : fixed(ex?.previousAverage ?? null); pct = pending ? null : ex?.percentageChange ?? null;
    note = ex?.pairedAthletes ? `Each athlete's value is the mean of all trials in their latest test; previous uses their prior test. Current and previous compare the same ${ex.pairedAthletes} paired athlete${ex.pairedAthletes === 1 ? '' : 's'}. This is the app's calculation and may differ from VALD's own summaries.` : `Each athlete's value is the mean of all trials in their latest test. No paired previous test yet, so no change is shown. May differ from VALD's own summaries.`;
  }

  return <View style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
    <View style={st.head}>
      <Text style={[st.title, { color: c.foreground }]} numberOfLines={1}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Refresh ${title}`} onPress={onRefresh} hitSlop={8} testID={`vald-refresh-${ex?.id ?? metricId}`}>
        <Feather name="refresh-cw" size={14} color={fetching ? c.primary : c.mutedForeground} />
      </Pressable>
    </View>
    {legacy ? <View style={[st.picker, { borderColor: c.border, opacity: 0.7 }]}>
      <Text style={[st.pickerText, { color: c.mutedForeground }]} numberOfLines={1}>Jump Height (Imp-Mom){unitSuffix(legacyUnit)}</Text>
    </View> : <Pressable testID={`vald-measure-${ex?.id}`} accessibilityRole="combobox" accessibilityLabel={`${title} measurement`} accessibilityHint="Opens the available VALD measurements for this exercise" accessibilityValue={{ text: selected ? optLabel(selected) : 'None' }} onPress={() => setPickerOpen(true)} style={[st.picker, { borderColor: c.primary, backgroundColor: `${c.primary}14` }]}>
      <Text style={[st.pickerText, { color: c.foreground }]} numberOfLines={2}>{selected ? optLabel(selected) : 'Choose measurement'}</Text>
      <Feather name="chevron-down" size={15} color={c.primary} />
    </Pressable>}
    {pending ? <Text accessibilityLiveRegion="polite" style={[st.n, { color: c.mutedForeground }]}>Loading selected measurement…</Text> : null}
    {fellBack ? <Text style={[st.n, { color: c.primary }]}>{requestedName ? `${requestedName.name} has no results in these filters` : 'Your chosen measurement is not available in these filters'}; showing {selected ? selected.name : 'no measurement'} instead.</Text> : null}
    <Text style={[st.avg, { color: c.mutedForeground }]}>{label}{unit ? ` (${unit})` : ''}</Text>
    <Text style={[st.big, { color: c.foreground }]}>{big}</Text>
    <View style={st.row}>
      <Text style={[st.base, { color: c.mutedForeground }]}>Previous {prev}</Text>
      <Text accessibilityLabel={`Change ${fmtPct(pct)}, direction of improvement not assessed`} style={[st.pct, { color: c.mutedForeground }]}>{fmtPct(pct)}</Text>
    </View>
    {showDetails ? <Text style={[st.n, { color: c.mutedForeground }]}>{note}</Text> : null}
    {legacy && needsSync ? <View style={[st.banner, { borderColor: c.primary, backgroundColor: `${c.primary}14` }]}>
      <Feather name="alert-circle" size={13} color={c.primary} />
      <Text style={[st.bannerText, { color: c.foreground }]}>Full VALD history is not synced yet. Run VALD sync to load the measurements for this exercise.</Text>
    </View> : null}
    {!legacy ? <View style={st.foot}>
      <Text style={[st.n, { color: c.mutedForeground, marginTop: 0, flex: 1 }]}>{ex?.athletes.length ?? 0} athletes · {ex?.results.length ?? 0} trials{lastSyncedAt ? ` · Synced ${fmtDate(lastSyncedAt)}` : ''}</Text>
      <Btn testID={`vald-details-${ex?.id}`} label="All results" icon="list" kind="ghost" onPress={() => setDetailsOpen(true)} disabled={pending || !ex?.results.length} />
    </View> : null}
    {renderGraph ? legacy ? renderGraph(metricId, legacyUnit, undefined) :
      ex && !pending ? <ValdMeasurementChart exercise={ex} measurementName={selected?.name ?? ''} /> : null : null}
    {ex ? <MeasurementPicker visible={pickerOpen} title={title} options={options} selectedId={ex.selectedMeasurementId} onClose={() => setPickerOpen(false)} onPick={(id) => { onPick(id); setPickerOpen(false); }} /> : null}
    {ex && detailsOpen ? <ResultsSheet ex={ex} title={title} selected={selected} onClose={() => setDetailsOpen(false)} /> : null}
  </View>;
}

function MeasurementPicker({ visible, title, options, selectedId, onClose, onPick }: { visible: boolean; title: string; options: ValdMeasurementOption[]; selectedId: string | null; onClose: () => void; onPick: (id: string) => void }) {
  const c = useColors();
  const [qs, setQs] = useState('');
  const list = useMemo(() => {
    const t = qs.trim().toLowerCase();
    return t ? options.filter((o) => `${o.name} ${o.code} ${o.unit} ${o.limb}`.toLowerCase().includes(t)) : options;
  }, [qs, options]);
  return <Sheet visible={visible} title={`${title} measurement`} onClose={onClose}>
    <SearchBox testID="vald-measure-search" value={qs} onChange={setQs} placeholder={`Search ${options.length} measurements`} />
    {!list.length ? <Text style={[st.n, { color: c.mutedForeground }]}>No measurement matches "{qs}".</Text> : null}
    <View accessibilityRole="list">
      {list.map((o) => {
        const on = o.id === selectedId;
        return <Pressable key={o.id} testID={`vald-option-${o.id}`} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={optLabel(o)} onPress={() => onPick(o.id)} style={[st.opt, { borderColor: on ? c.primary : c.border, backgroundColor: on ? `${c.primary}1f` : 'transparent' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.optName, { color: c.foreground }]}>{o.name}</Text>
            <Text style={[st.optMeta, { color: c.mutedForeground }]}>{[o.unit || 'No unit', o.limb, o.code].filter(Boolean).join(' · ')}</Text>
          </View>
          {on ? <Feather name="check" size={16} color={c.primary} /> : null}
        </Pressable>;
      })}
    </View>
  </Sheet>;
}

const PAGE = 40;
function ResultsSheet({ ex, title, selected, onClose }: { ex: ValdExerciseMeasurements; title: string; selected: ValdMeasurementOption | null; onClose: () => void }) {
  const c = useColors();
  const [n, setN] = useState(PAGE);
  const [qs, setQs] = useState('');
  const rows = useMemo(() => {
    const t = qs.trim().toLowerCase();
    return [...ex.results].filter((r) => !t || r.athleteName.toLowerCase().includes(t))
      .sort((a, b) => b.testingDate.localeCompare(a.testingDate) || a.athleteName.localeCompare(b.athleteName) || a.repeat - b.repeat);
  }, [ex.results, qs]);
  const u = ex.unit || selected?.unit || '';
  return <Sheet visible title={`${title} · ${selected?.name ?? 'Results'}`} onClose={onClose}>
    <Text style={[st.n, { color: c.mutedForeground, marginTop: 0, marginBottom: 8 }]}>Every saved trial and repeat for the current filters{u ? `, in ${u}` : ''}. Newest first.</Text>
    <SearchBox testID="vald-results-search" value={qs} onChange={(v) => { setQs(v); setN(PAGE); }} placeholder="Filter by athlete" />
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={{ minWidth: 470 }}>
        <View style={[st.tr, { borderColor: c.border }]}>
          {['Date', 'Athlete', 'Rep', 'Limb', 'Value'].map((h, i) => <Text key={h} style={[st.th, { color: c.mutedForeground, width: COLS[i], textAlign: i === 4 ? 'right' : 'left' }]}>{h}</Text>)}
        </View>
        {rows.slice(0, n).map((r) => <View key={`${r.testId}-${r.trialId}-${r.repeat}-${r.limb}`} style={[st.tr, { borderColor: c.border }]}>
          <Text style={[st.td, { color: c.mutedForeground, width: COLS[0] }]}>{fmtDate(r.testingDate)}</Text>
          <Text style={[st.td, { color: c.foreground, width: COLS[1] }]} numberOfLines={1}>{r.athleteName}</Text>
          <Text style={[st.td, { color: c.mutedForeground, width: COLS[2] }]}>{r.repeat}</Text>
          <Text style={[st.td, { color: c.mutedForeground, width: COLS[3] }]}>{r.limb || '-'}</Text>
          <Text style={[st.td, { color: c.foreground, width: COLS[4], textAlign: 'right', fontFamily: 'Inter_600SemiBold' }]}>{fixed(r.value)}{unitSuffix(u)}</Text>
        </View>)}
      </View>
    </ScrollView>
    <Text style={[st.n, { color: c.mutedForeground }]}>Showing {Math.min(n, rows.length)} of {rows.length}</Text>
    {n < rows.length ? <View style={{ marginTop: 8 }}><Btn testID="vald-results-more" label={`Show ${Math.min(PAGE, rows.length - n)} more`} kind="ghost" onPress={() => setN((x) => x + PAGE)} /></View> : null}
  </Sheet>;
}
const COLS = [86, 150, 40, 70, 110];

const st = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 130 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 13, flex: 1 },
  picker: { marginTop: 8, minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  avg: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 10 },
  big: { fontFamily: 'Inter_700Bold', fontSize: 36, marginVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  base: { fontFamily: 'Inter_500Medium', fontSize: 15 },
  pct: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  n: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 6, lineHeight: 14 },
  banner: { flexDirection: 'row', gap: 7, borderWidth: 1, borderRadius: 10, padding: 9, marginTop: 9, alignItems: 'flex-start' },
  bannerText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 15 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  opt: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6, gap: 8 },
  optName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  optMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  tr: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7, gap: 6 },
  th: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  td: { fontFamily: 'Inter_400Regular', fontSize: 12 },
});
