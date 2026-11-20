import React from 'react';
import { Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Shell } from '@/components/metrics/Shell';
import { Body, Card, Chip, Empty, ErrorBox, H, Skeleton } from '@/components/metrics/ui';
import { FilterBar } from '@/components/metrics/FilterBar';
import { KpiCards } from '@/components/metrics/KpiCards';
import { AthleteProgressChart } from '@/components/metrics/AthleteProgressChart';
import { MetricProgressChart } from '@/components/metrics/MetricProgressChart';
import { CategoryTabs } from '@/components/metrics/CategoryTabs';
import { CoachNotes } from '@/components/metrics/CoachNotes';
import { HealthPanel } from '@/components/metrics/HealthPanel';
import { STATUS_LABEL, athleteTeamAverageParams, athleteWorkspaceParams, fixed, fmtDate, fmtPct, groupSummaries, useFilters, useWorkspace } from '@/lib/metrics';

export function AthleteMetricsScreen({ routeId }: { routeId: string }) {
  const c = useColors(); const { role, user } = useApp(); const f = useFilters();
  const [familySelection, setFamilySelection] = React.useState('');
  const staff = role === 'Admin' || role === 'Staff-Coach';
  const parent = role === 'Parent-Athlete';
  const familyLanding = routeId === 'family';
  const familyRosterQuery = useWorkspace({ athleteIds: 'none' }, parent);
  const linkedAthletes = familyRosterQuery.data?.athletes ?? [];
  const selectedFamilyId = linkedAthletes.some((athlete) => athlete.id === familySelection)
    ? familySelection
    : linkedAthletes.some((athlete) => athlete.id === routeId) ? routeId : familyLanding ? linkedAthletes[0]?.id ?? '' : '';
  const athleteId = parent
    ? linkedAthletes.some((athlete) => athlete.id === selectedFamilyId) ? selectedFamilyId : ''
    : routeId;
  const selfAthlete = role === 'Athlete' && user?.id === athleteId;
  const familyAccess = parent && linkedAthletes.some((athlete) => athlete.id === athleteId);
  const canView = staff || selfAthlete || familyAccess;
  const params = athleteId ? athleteWorkspaceParams(f, athleteId) : { athleteIds: 'none' };
  const q = useWorkspace(params, canView);
  const ws = q.data; const a = ws?.athletes.find((x) => x.id === athleteId);
  const averageTeams = [...new Set(a?.teams ?? [])].map((teamId) => {
    const label = ws?.teams.find((team) => team.id === teamId)?.label ?? teamId;
    const ageGroup = label.match(/^(?:LPA\s+)?(\d+)U$/i)?.[1];
    return { id: teamId, label: ageGroup ? `${ageGroup}u` : label };
  });
  // Fetch a shared comparison workspace for multiple teams, then calculate each
  // team's average independently using its actual roster membership.
  const teamAverageParams = athleteTeamAverageParams(f, averageTeams.length === 1 ? averageTeams[0].id : undefined);
  const teamAverageQuery = useWorkspace(teamAverageParams, Boolean(averageTeams.length && staff));
  if (parent && familyRosterQuery.isLoading) return <Shell title="Student Metrics"><Skeleton /></Shell>;
  if (parent && familyRosterQuery.isError) return <Shell title="Student Metrics"><ErrorBox message="Linked athlete metrics could not load." onRetry={() => void familyRosterQuery.refetch()} /></Shell>;
  if (parent && !linkedAthletes.length) return <Shell title="Student Metrics"><Empty title="No linked athletes" copy="Athletes connected to your family account will appear here." /></Shell>;
  if (!canView) return <Shell title="Athlete profile"><Card><Body>Athlete profiles are for staff and each athlete can view only their own metrics.</Body></Card></Shell>;
  const groups = groupSummaries(ws);
  return <Shell title={selfAthlete ? 'My Metrics' : a?.fullName ?? 'Athlete profile'} kicker={selfAthlete ? 'MY PERFORMANCE' : a ? `${a.teams.join(', ')}${a.gradYear ? ` · ${a.gradYear}` : ''}`.toUpperCase() : 'LPA METRICS'} onRefresh={() => { void q.refetch(); if (parent) void familyRosterQuery.refetch(); }} refreshing={q.isRefetching || familyRosterQuery.isRefetching} keyboardAware>
    {parent && linkedAthletes.length > 1 ? <View testID="family-athlete-switcher" style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
      {linkedAthletes.map((athlete) => <Chip key={athlete.id} label={athlete.fullName} active={athlete.id === athleteId} onPress={() => {
        setFamilySelection(athlete.id);
      }} />)}
    </View> : null}
    <CategoryTabs f={f} />
    <FilterBar f={f} ws={ws} hideAthletes hideTeam />
    {(staff || selfAthlete || familyAccess) && a ? <CoachNotes key={athleteId} athleteId={athleteId} canManage={staff} /> : null}
    {staff && averageTeams.length > 0 && teamAverageQuery.isError ? <ErrorBox message="The team averages could not be loaded." onRetry={() => void teamAverageQuery.refetch()} /> : null}
    {f.category === 'Health' ? <>
      <HealthPanel athleteId={athleteId} teamWorkspace={staff ? teamAverageQuery.data : undefined} averageTeams={staff ? averageTeams : []} showTeamAverage={staff && averageTeams.length > 0} canEdit={staff} />
      {ws && a && !q.isError ? <AthleteProgressChart key={athleteId} ws={ws} athleteId={athleteId} athleteName={a.fullName} /> : null}
    </> : <>
      {q.isLoading ? <><Skeleton /><Skeleton h={160} /></> : q.isError ? <ErrorBox message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : !a ? <Empty title="Athlete not found" copy="This person is not on your authorized Athlete roster." /> : <>
        <KpiCards ws={ws} title="Latest results" label="Latest" showDetails={false} teamWorkspace={staff ? teamAverageQuery.data : undefined} averageTeams={staff ? averageTeams : []} showTeamAverage={staff && averageTeams.length > 0} renderGraph={ws ? (metricId, unit, protocol) => <MetricProgressChart key={`${athleteId}-${metricId}-${unit}-${protocol ?? ''}`} ws={ws} athleteId={athleteId} metricId={metricId} unit={unit} protocol={protocol} /> : undefined} />
        <View style={{ height: 14 }} />
        {ws ? <AthleteProgressChart key={athleteId} ws={ws} athleteId={athleteId} athleteName={a.fullName} /> : null}
        <View style={{ height: 14 }} />
        <Card>
          <H>Growth summary</H>
          <Body>{groups.filter((g) => g.metric.direction !== 'neutral' && g.summaries.some((s) => s.status === 'improved')).length} metrics improved · {groups.reduce((n, g) => n + (g.metric.direction === 'neutral' ? 0 : g.summaries.filter((s) => s.personalBestInPeriod).length), 0)} personal bests</Body>
        </Card>
        {[...new Set(groups.map((g) => g.metric.category))].sort().map((cat) => <Card key={cat}>
          <H sub="First, latest, best and change per metric.">{cat}</H>
          {groups.filter((g) => g.metric.category === cat).map((g) => g.summaries.map((s) => <View key={g.key} style={{ borderTopWidth: 1, borderColor: c.border, paddingVertical: 10 }}>
            <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{g.metric.name}{s.personalBestInPeriod && g.metric.direction !== 'neutral' ? '  PB' : ''}</Text>
            <Body muted style={{ fontSize: 12 }}>First {fixed(s.first, g.metric.decimals)} · Latest {fixed(s.latest, g.metric.decimals)} · Previous {fixed(s.previous, g.metric.decimals)} · Best {g.metric.direction === 'neutral' ? 'N/A' : fixed(s.best, g.metric.decimals)}</Body>
            <Body muted style={{ fontSize: 12 }}>Change {fixed(s.change, g.metric.decimals)} ({fmtPct(s.percentChange)}) · Overall {fixed(s.overallChange, g.metric.decimals)} ({fmtPct(s.overallPercentChange)}) · {s.count} tests · last {fmtDate(s.lastTestingDate)} · {g.metric.direction === 'neutral' ? 'Tracked' : STATUS_LABEL[s.status] ?? s.status}</Body>
          </View>))}
        </Card>)}
      </>}
    </>}
  </Shell>;
}
