import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Body, Btn, Card, Chip, Empty, H, SearchBox } from './ui';
import { MetricsWorkspace, STATUS_LABEL, fixed, fmtDate, fmtPct, setFilters } from '@/lib/metrics';

type Key = 'athlete' | 'metric' | 'latest' | 'percent' | 'date';
const PAGE = 15;

/** Detailed summary table. Athlete and metric links only for staff. Reused by team, athlete and report views. */
export function SummaryTable({ ws, staff = false, title = 'Detailed summary', onMetric }: { ws?: MetricsWorkspace; staff?: boolean; title?: string; onMetric?: () => void }) {
  const c = useColors(); const router = useRouter();
  const [q, setQ] = useState(''); const [sort, setSort] = useState<Key>('athlete'); const [asc, setAsc] = useState(true); const [page, setPage] = useState(0);
  const scope = JSON.stringify(ws?.filters);
  useEffect(() => setPage(0), [scope]);
  const rows = useMemo(() => {
    const athletes = new Map(ws?.athletes.map((a) => [a.id, a]));
    const metrics = new Map(ws?.metrics.map((m) => [m.id, m]));
    const list = (ws?.summaries ?? []).map((s) => ({ s, a: athletes.get(s.athleteId), m: metrics.get(s.metricId) })).filter((r) => r.a && r.m);
    const t = q.trim().toLowerCase();
    const f = list.filter((r) => !t || `${r.a!.fullName} ${r.m!.name} ${r.a!.teams.join(' ')} ${STATUS_LABEL[r.s.status] ?? ''}`.toLowerCase().includes(t));
    const d = asc ? 1 : -1;
    return f.sort((x, y) => d * (sort === 'athlete' ? x.a!.fullName.localeCompare(y.a!.fullName) : sort === 'metric' ? x.m!.name.localeCompare(y.m!.name) : sort === 'latest' ? (x.s.latest ?? -Infinity) - (y.s.latest ?? -Infinity) : sort === 'percent' ? (x.s.percentChange ?? -Infinity) - (y.s.percentChange ?? -Infinity) : (x.s.lastTestingDate ?? '').localeCompare(y.s.lastTestingDate ?? '')));
  }, [ws, q, sort, asc]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE)); const cur = Math.min(page, pages - 1);
  const pick = (k: Key) => { if (sort === k) setAsc(!asc); else { setSort(k); setAsc(k === 'athlete' || k === 'metric'); } setPage(0); };
  return <Card>
    <H sub="Previous, latest, change and best per athlete and metric. Statuses never call neutral metrics better or worse.">{title}</H>
    <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search athlete, metric, team, status" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{([['athlete', 'Athlete'], ['metric', 'Metric'], ['latest', 'Latest'], ['percent', 'Change %'], ['date', 'Date']] as [Key, string][]).map(([k, l]) => <Chip key={k} label={`${l}${sort === k ? (asc ? ' (asc)' : ' (desc)') : ''}`} active={sort === k} onPress={() => pick(k)} />)}</View>
    {!rows.length ? <Empty title="No summary rows" copy="No athlete has results for the current filters." /> : rows.slice(cur * PAGE, cur * PAGE + PAGE).map(({ s, a, m }) => <View key={`${s.athleteId}${s.metricId}${s.unit}${s.protocol}`} style={{ borderTopWidth: 1, borderColor: c.border, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
        {staff ? <Pressable onPress={() => router.push(`/metrics/athlete/${a!.id}` as never)}><Text style={{ color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{a!.fullName}</Text></Pressable> : <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{a!.fullName}</Text>}
        {staff ? <Pressable onPress={() => { setFilters({ metricIds: [m!.id], metricsCleared: false }); onMetric?.(); }}><Text style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{m!.name}</Text></Pressable> : <Text style={{ color: c.foreground, fontSize: 12 }}>{m!.name}</Text>}
        <Text style={{ color: c.mutedForeground, fontSize: 11 }}>{a!.teams.join(', ')}</Text>
      </View>
      <Body muted style={{ fontSize: 12 }}>Previous {fixed(s.previous, m!.decimals)} · Latest {fixed(s.latest, m!.decimals)} {s.unit} · Change {fixed(s.change, m!.decimals)} ({fmtPct(s.percentChange)}) · Best {m!.direction === 'neutral' ? 'N/A (neutral)' : fixed(s.best, m!.decimals)}</Body>
      <Body muted style={{ fontSize: 12 }}>{fmtDate(s.lastTestingDate)} · {m!.direction === 'neutral' ? 'Tracked, no better or worse' : STATUS_LABEL[s.status] ?? s.status}{s.personalBestInPeriod && m!.direction !== 'neutral' ? ' · personal best' : ''}</Body>
    </View>)}
    {rows.length > PAGE ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Btn label="Previous" kind="ghost" disabled={cur === 0} onPress={() => setPage(cur - 1)} /><Body muted>Page {cur + 1} of {pages}</Body><Btn label="Next" kind="ghost" disabled={cur >= pages - 1} onPress={() => setPage(cur + 1)} /></View> : null}
  </Card>;
}
