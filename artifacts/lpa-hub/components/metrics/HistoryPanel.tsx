import React, { useEffect, useMemo, useState } from 'react';
import { useGetMetricsHistory } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Body, Btn, Card, Chip, Empty, ErrorBox, H, Label, SearchBox, Skeleton } from './ui';
import { AuditSheet } from './AuditSheet';
import { CorrectionSheet } from './CorrectionSheet';
import { MetricsWorkspace, PerformanceResult, fixed, fmtDate, fmtNum } from '@/lib/metrics';

type SortKey = 'date' | 'athlete' | 'metric' | 'value';
const PAGE = 25;

export function HistoryPanel({ ws, canEdit = true }: { ws?: MetricsWorkspace; canEdit?: boolean }) {
  const c = useColors();
  const [q, setQ] = useState(''); const [sort, setSort] = useState<SortKey>('date'); const [asc, setAsc] = useState(false); const [page, setPage] = useState(0);
  const [fix, setFix] = useState<PerformanceResult | null>(null); const [audit, setAudit] = useState<string | null>(null);
  const { user } = useApp();
  const [search, setSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearch(q), 250); return () => clearTimeout(timer); }, [q]);
  const scope = JSON.stringify(ws?.filters);
  useEffect(() => setPage(0), [scope]);
  const remote = useGetMetricsHistory({ ...ws?.filters, offset: page * PAGE, limit: PAGE, search, sort, direction: asc ? 'asc' : 'desc' }, {
    query: { enabled: !!ws?.historyPaged, queryKey: ['/api/metrics/history', user?.id, ws?.filters, page, search, sort, asc], refetchInterval: 30_000, staleTime: 10_000 },
  });
  const name = (id: string) => ws?.athletes.find((a) => a.id === id)?.fullName ?? 'Athlete';
  const mname = (id: string) => ws?.metrics.find((m) => m.id === id)?.name ?? id;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = (ws?.results ?? []).filter((r) => !t || `${name(r.athleteId)} ${mname(r.metricId)} ${r.sessionName} ${r.recorderName} ${r.notes ?? ''}`.toLowerCase().includes(t));
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => dir * (sort === 'date' ? a.testingDate.localeCompare(b.testingDate) || a.createdAt.localeCompare(b.createdAt) : sort === 'value' ? a.value - b.value : sort === 'athlete' ? name(a.athleteId).localeCompare(name(b.athleteId)) : mname(a.metricId).localeCompare(mname(b.metricId))));
  }, [ws, q, sort, asc]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = ws?.historyPaged ? remote.data?.total ?? 0 : rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const cur = ws?.historyPaged ? (remote.data?.offset ?? 0) / PAGE : Math.min(page, pages - 1);
  const slice = ws?.historyPaged ? remote.data?.results ?? [] : rows.slice(cur * PAGE, cur * PAGE + PAGE);
  const pick = (k: SortKey) => { if (sort === k) setAsc(!asc); else { setSort(k); setAsc(k !== 'date'); } setPage(0); };
  return <View>
    <H sub="Results in the current filter scope. Corrections keep the original in the audit history.">Testing history</H>
    <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search athlete, metric, session, notes" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}><Label>Sort</Label><View style={{ width: 8 }} />
      {(['date', 'athlete', 'metric', 'value'] as SortKey[]).map((k) => <Chip key={k} label={`${k}${sort === k ? (asc ? ' (asc)' : ' (desc)') : ''}`} active={sort === k} onPress={() => pick(k)} />)}</View>
    {ws?.historyPaged && remote.isLoading ? <Skeleton /> : ws?.historyPaged && remote.isError ? <ErrorBox message="Testing history could not load." onRetry={() => void remote.refetch()} /> : !slice.length ? <Empty title="No testing results" copy={q ? 'No results match your search.' : 'No results match the current filters.'} /> : slice.map((r) => <Card key={r.id} style={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{name(r.athleteId)}</Text><Body muted style={{ fontSize: 12 }}>{mname(r.metricId)} · {r.protocol}</Body></View>
        <View style={{ alignItems: 'flex-end' }}><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>{fixed(r.value, ws?.metrics.find((m) => m.id === r.metricId)?.decimals)} <Text style={{ fontSize: 11, color: c.mutedForeground }}>{r.unit}</Text></Text><Body muted style={{ fontSize: 11 }}>{fmtDate(r.testingDate)}</Body></View>
      </View>
      <Body muted style={{ fontSize: 11, marginTop: 4 }}>{r.sessionName} · by {r.recorderName} · rev {r.revision}{r.sets ? ` · ${r.sets} sets` : ''}{r.repetitions ? ` x ${r.repetitions} reps` : ''}</Body>
      {(r as any).goal != null ? <Body style={{ fontSize: 12 }}>Goal (recorded target): {fixed((r as any).goal, ws?.metrics.find((m) => m.id === r.metricId)?.decimals)} {r.unit}</Body> : null}
      {r.notes ? <Body style={{ fontSize: 12 }}>Internal: {r.notes}</Body> : null}
      {r.publicNotes ? <Body style={{ fontSize: 12 }}>Public: {r.publicNotes}</Body> : null}
      {canEdit ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Btn label="Correct" kind="ghost" onPress={() => setFix(r)} /><Btn label="History" kind="ghost" onPress={() => setAudit(r.id)} /></View> : null}
    </Card>)}
    {total > PAGE ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Btn label="Previous" kind="ghost" disabled={cur === 0 || remote.isFetching} onPress={() => setPage(cur - 1)} /><Body muted>Page {cur + 1} of {pages} · {total} results</Body><Btn label="Next" kind="ghost" disabled={cur >= pages - 1 || remote.isFetching} onPress={() => setPage(cur + 1)} /></View> : null}
    <CorrectionSheet result={fix} athleteName={fix ? name(fix.athleteId) : ''} metricName={fix ? mname(fix.metricId) : ''} showGoal={fix ? ws?.metrics.find((m) => m.id === fix.metricId)?.category === 'Health' : false} onClose={() => setFix(null)} />
    <AuditSheet kind="result" id={audit} title="Result audit history" onClose={() => setAudit(null)} />
  </View>;
}
void Pressable; void ScrollView;
