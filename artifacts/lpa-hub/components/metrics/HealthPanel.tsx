import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Body, Btn, Card, Empty, ErrorBox, H, Skeleton } from './ui';
import { HEALTH_METRICS } from './CategoryTabs';
import { HistoryPanel } from './HistoryPanel';
import { MetricProgressChart } from './MetricProgressChart';
import { athleteWorkspaceParams, fixed, fmtDate, latestTeamAverage, MetricsWorkspace, periodError, useFilters, useWorkspace } from '@/lib/metrics';

/** Exactly three tracked items per athlete: latest value, date, optional recorded goal. All neutral. */
export function HealthPanel({ athleteId, teamWorkspace, teamLabel, showTeamAverage = false }: { athleteId: string; teamWorkspace?: MetricsWorkspace; teamLabel?: string; showTeamAverage?: boolean }) {
  const c = useColors(); const router = useRouter();
  const filters = useFilters();
  const invalidPeriod = periodError(filters);
  const q = useWorkspace(athleteWorkspaceParams(filters, athleteId, { category: 'Health' }), !invalidPeriod);
  const [hist, setHist] = useState<string | null>(null);
  const ws = q.data;
  if (invalidPeriod) return <ErrorBox message={invalidPeriod} />;
  if (q.isLoading) return <Skeleton h={160} />;
  if (q.isError) return <ErrorBox message="Health tracking could not load." onRetry={() => void q.refetch()} />;
  const items = HEALTH_METRICS.map((id) => {
    const m = ws?.metrics.find((x) => x.id === id);
    const rows = (ws?.results ?? []).filter((r) => r.metricId === id).sort((a, b) => b.testingDate.localeCompare(a.testingDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const latest = rows[0];
    const group = latest
      ? ws?.summaries.find((s) => s.athleteId === athleteId && s.metricId === id && s.unit === latest.unit && s.protocol === latest.protocol)
      : undefined;
    const unit = latest?.unit ?? group?.unit ?? m?.unit ?? '';
    const average = group ? latestTeamAverage(teamWorkspace, id, group.unit, group.protocol) : null;
    return { id, m, latest, goal: latest?.goal ?? null, unit, average };
  });
  const histWs = ws && hist ? { ...ws, filters: { ...ws.filters, metricIds: hist }, results: ws.results.filter((r) => r.metricId === hist) } : undefined;
  return <View>
    <H sub="Neutral tracking of recorded values. Changes are not judged as better or worse, and this is not medical advice.">Health</H>
    {items.map(({ id, m, latest, goal, unit, average }) => <Card key={id}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{m?.name ?? id}</Text>
          <Body muted style={{ fontSize: 12 }}>Date set {latest ? fmtDate(latest.testingDate) : '-'}</Body>
          <Body muted style={{ fontSize: 12 }}>Goal {goal !== null ? `${fixed(goal, m?.decimals)} ${unit} (recorded target)` : 'N/A'}</Body>
          {showTeamAverage && teamLabel ? <Body muted style={{ fontSize: 12, marginTop: 5 }}>Avg {m?.name ?? id} {teamLabel}: {average === null ? '-' : `${fixed(average, m?.decimals)}${unit ? ` ${unit}` : ''}`}</Body> : null}</View>
        <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 26 }}>{latest ? fixed(latest.value, m?.decimals) : '-'} <Text style={{ fontSize: 12, color: c.mutedForeground }}>{unit}</Text></Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Btn label="Add" icon="plus" onPress={() => router.push({ pathname: '/metrics', params: { tab: 'Overview', athleteId, metricId: id } } as never)} />
        <Btn label={hist === id ? 'Hide history' : 'History'} kind="ghost" onPress={() => setHist(hist === id ? null : id)} />
      </View>
      {ws ? <MetricProgressChart key={`${athleteId}-${id}`} ws={ws} athleteId={athleteId} metricId={id} /> : null}
    </Card>)}
    {!ws?.metrics.length ? <Empty title="Health metrics unavailable" copy="Body weight, body fat and heart rate have not been set up yet." /> : null}
    {histWs ? <HistoryPanel ws={histWs} /> : null}
  </View>;
}
