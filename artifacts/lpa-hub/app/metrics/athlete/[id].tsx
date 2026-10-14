import React from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Shell } from '@/components/metrics/Shell';
import { Body, Card, Empty, ErrorBox, H, Skeleton } from '@/components/metrics/ui';
import { FilterBar } from '@/components/metrics/FilterBar';
import { KpiCards } from '@/components/metrics/KpiCards';
import { AthleteProgressChart } from '@/components/metrics/AthleteProgressChart';
import { MetricProgressChart } from '@/components/metrics/MetricProgressChart';
import { CategoryTabs } from '@/components/metrics/CategoryTabs';
import { HealthPanel } from '@/components/metrics/HealthPanel';
import { STATUS_LABEL, athleteTeamAverageParams, athleteWorkspaceParams, fixed, fmtDate, fmtPct, groupSummaries, useFilters, useWorkspace } from '@/lib/metrics';

export default function AthleteProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors(); const { role } = useApp(); const f = useFilters();
  const params = athleteWorkspaceParams(f, String(id));
  const q = useWorkspace(params);
  const ws = q.data; const a = ws?.athletes.find((x) => x.id === id);
  const averageTeamId = a?.teams[0];
  const rawAverageTeamLabel = averageTeamId ? ws?.teams.find((team) => team.id === averageTeamId)?.label ?? averageTeamId : undefined;
  const ageGroup = rawAverageTeamLabel?.match(/^(?:LPA\s+)?(\d+)U$/i)?.[1];
  const averageTeamLabel = ageGroup ? `${ageGroup}u` : rawAverageTeamLabel;
  const teamAverageParams = athleteTeamAverageParams(f, averageTeamId);
  const teamAverageQuery = useWorkspace(teamAverageParams, Boolean(averageTeamId && (role === 'Admin' || role === 'Staff-Coach')));
  if (role !== 'Admin' && role !== 'Staff-Coach') return <Shell title="Athlete profile"><Card><Body>Athlete profiles are for Admin and Staff-Coach users.</Body></Card></Shell>;
  const groups = groupSummaries(ws);
  return <Shell title={a?.fullName ?? 'Athlete profile'} kicker={a ? `${a.teams.join(', ')}${a.gradYear ? ` · ${a.gradYear}` : ''}`.toUpperCase() : 'LPA METRICS'} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
    <CategoryTabs f={f} />
     <FilterBar f={f} ws={ws} hideAthletes hideTeam />
     {averageTeamId && teamAverageQuery.isError ? <ErrorBox message="The team averages could not be loaded." onRetry={() => void teamAverageQuery.refetch()} /> : null}
    {f.category === 'Health' ? <>
       <HealthPanel athleteId={String(id)} teamWorkspace={teamAverageQuery.data} teamLabel={averageTeamLabel} showTeamAverage={Boolean(averageTeamId && averageTeamLabel)} />
      {ws && a && !q.isError ? <AthleteProgressChart key={String(id)} ws={ws} athleteId={String(id)} athleteName={a.fullName} /> : null}
    </> : <>
    {q.isLoading ? <><Skeleton /><Skeleton h={160} /></> : q.isError ? <ErrorBox message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : !a ? <Empty title="Athlete not found" copy="This person is not on your authorized Athlete roster." /> : <>
       <KpiCards ws={ws} title="Latest results" label="Latest" showDetails={false} teamWorkspace={teamAverageQuery.data} teamLabel={averageTeamLabel} showTeamAverage={Boolean(averageTeamId && averageTeamLabel)} renderGraph={ws ? (metricId, unit, protocol) => <MetricProgressChart key={`${id}-${metricId}-${unit}-${protocol ?? ''}`} ws={ws} athleteId={String(id)} metricId={metricId} unit={unit} protocol={protocol} /> : undefined} />
      <View style={{ height: 14 }} />
      {ws ? <AthleteProgressChart key={String(id)} ws={ws} athleteId={String(id)} athleteName={a.fullName} /> : null}
      <View style={{ height: 14 }} />
      <Card>
        <H sub="Growth counts exclude neutral metrics. Lower is better for sprints, so a faster time counts as improved.">Growth summary</H>
        <Body>{groups.filter((g) => g.metric.direction !== 'neutral' && g.summaries.some((s) => s.status === 'improved')).length} metrics improved · {groups.reduce((n, g) => n + (g.metric.direction === 'neutral' ? 0 : g.summaries.filter((s) => s.personalBestInPeriod).length), 0)} personal bests</Body>
      </Card>
      {[...new Set(groups.map((g) => g.metric.category))].sort().map((cat) => <Card key={cat}>
        <H sub="First, latest, best and change per metric.">{cat}</H>
        {groups.filter((g) => g.metric.category === cat).map((g) => g.summaries.map((s) => <View key={g.key} style={{ borderTopWidth: 1, borderColor: c.border, paddingVertical: 10 }}>
          <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{g.metric.name} <Text style={{ color: c.mutedForeground, fontSize: 11 }}>({s.unit}, {s.protocol})</Text>{s.personalBestInPeriod && g.metric.direction !== 'neutral' ? '  PB' : ''}</Text>
          <Body muted style={{ fontSize: 12 }}>First {fixed(s.first, g.metric.decimals)} · Latest {fixed(s.latest, g.metric.decimals)} · Previous {fixed(s.previous, g.metric.decimals)} · Best {g.metric.direction === 'neutral' ? 'N/A' : fixed(s.best, g.metric.decimals)}</Body>
          <Body muted style={{ fontSize: 12 }}>Change {fixed(s.change, g.metric.decimals)} ({fmtPct(s.percentChange)}) · Overall {fixed(s.overallChange, g.metric.decimals)} ({fmtPct(s.overallPercentChange)}) · {s.count} tests · last {fmtDate(s.lastTestingDate)} · {g.metric.direction === 'neutral' ? 'Tracked' : STATUS_LABEL[s.status] ?? s.status}</Body></View>))}
      </Card>)}
    </>}
    </>}
  </Shell>;
}
