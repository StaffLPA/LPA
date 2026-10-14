import React from 'react';
import { Text, View } from 'react-native';
import { ReportExportBar } from '@/components/metrics/ReportExportBar';
import { useLocalSearchParams } from 'expo-router';
import { getGetPerformanceReportQueryKey, useGetPerformanceReport } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { SummaryTable } from '@/components/metrics/SummaryTable';
import { TeamCharts } from '@/components/metrics/TrendCharts';
import { useColors } from '@/hooks/useColors';
import { Shell } from '@/components/metrics/Shell';
import { Body, Btn, Card, Empty, ErrorBox, H, Skeleton } from '@/components/metrics/ui';
import { KpiCards } from '@/components/metrics/KpiCards';
import { ResultCharts } from '@/components/metrics/TrendCharts';
import { fmtDate, fixed, fmtPct, groupSummaries, plainChange } from '@/lib/metrics';

export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const rid = String(id); const { user } = useApp();
  const q = useGetPerformanceReport(rid, { query: { queryKey: [...getGetPerformanceReportQueryKey(rid), user?.id ?? 'anon'], refetchInterval: 30_000 } as never });
  const r = q.data; const ws = r?.snapshot;
  const groups = groupSummaries(ws);
  const noted = (ws?.results ?? []).filter((x) => x.publicNotes);
  return <Shell title={r?.title ?? 'Performance report'} kicker="PERFORMANCE REPORT" onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
    {q.isLoading ? <><Skeleton /><Skeleton h={160} /></> : q.isError || !r || !ws ? <ErrorBox message="This report is unavailable. It may have been withdrawn." onRetry={() => void q.refetch()} /> : <>
      <ReportExportBar id={rid} />
      <Body muted style={{ marginBottom: 10 }}>Snapshot created {fmtDate(r.createdAt)} · {ws.athletes.length} athlete{ws.athletes.length === 1 ? '' : 's'} · {ws.totalResults} results</Body>
      {(ws as any).filters ? <Body muted style={{ marginBottom: 10 }}>Period {fmtDate((ws as any).filters.start) === '-' ? 'all time' : `${fmtDate((ws as any).filters.start)} to ${fmtDate((ws as any).filters.end)}`}{(ws as any).filters.team ? ` · Team ${ws.teams.find((t) => t.id === (ws as any).filters.team)?.label ?? (ws as any).filters.team}` : ''}{(ws as any).filters.category ? ` · ${(ws as any).filters.category}` : ''}</Body> : null}
      {r.athleteIds.length > ws.athletes.filter((a) => ws.results.some((x) => x.athleteId === a.id)).length ? <Body muted style={{ marginBottom: 10 }}>{ws.athletes.filter((a) => !ws.results.some((x) => x.athleteId === a.id)).map((a) => a.fullName).join(', ') || 'Some selected athletes'} had no results in this period.</Body> : null}
      <KpiCards ws={ws} title="Summary" label="Group Average" />
      <View style={{ height: 14 }} />
      <TeamCharts ws={ws} staff={false} />
      <SummaryTable ws={ws} title="Summary" />
      <Card>
        <H sub="First to latest result for each athlete and metric.">Athlete results</H>
        {!groups.length ? <Empty title="No results in this report" /> : ws.athletes.map((a) => {
          const rows = groups.flatMap((g) => g.summaries.filter((s) => s.athleteId === a.id).map((s) => ({ g, s })));
          if (!rows.length) return null;
          return <View key={a.id} style={{ marginBottom: 12 }}><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{a.fullName}</Text>
            {rows.map(({ g, s }) => <Body key={g.key} muted style={{ fontSize: 12 }}>{g.metric.name}: {plainChange(s.first, s.latest, s.overallPercentChange, g.metric.direction, s.unit, g.metric.decimals)}{s.personalBestInPeriod && g.metric.direction !== 'neutral' ? ' Personal best.' : ''}</Body>)}</View>;
        })}
      </Card>
      {noted.length ? <Card><H>Coach notes</H>{noted.map((n) => <Body key={n.id} style={{ marginBottom: 6 }}>{ws.athletes.find((a) => a.id === n.athleteId)?.fullName}, {ws.metrics.find((m) => m.id === n.metricId)?.name} ({fmtDate(n.testingDate)}): {n.publicNotes}</Body>)}</Card> : null}
    </>}
  </Shell>;
}
