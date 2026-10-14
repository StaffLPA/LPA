import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useGetMetricsChartResults } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { Body, Card, Empty, ErrorBox, H, Skeleton } from './ui';
import { LineChart, Series } from './LineChart';
import { MetricsWorkspace } from '@/lib/metrics';
import { TpMode, buildAthleteProgress, monthLabel } from '@/lib/teamProgress';

const COLORS = ['#C97A4A', '#9BC7BD', '#E7C65B', '#8AA2D6', '#C98AB8', '#7FB77E', '#D6A06B', '#A78BDA'];

export function AthleteProgressChart({ ws, athleteId, athleteName, metricId, unit, protocol }: { ws: MetricsWorkspace; athleteId?: string; athleteName?: string; metricId?: string; unit?: string; protocol?: string }) {
  const c = useColors(); const { user } = useApp();
  const [mode, setMode] = useState<TpMode>('monthly');
  const paged = !!ws.historyPaged;
  const filters = useMemo(() => ({ ...(ws.filters ?? {}), athleteIds: athleteId ?? '' }), [ws.filters, athleteId]);
  const q = useGetMetricsChartResults(filters, { query: { enabled: paged && !!athleteId, queryKey: ['/api/metrics/chart-results', user?.id, 'athlete-progress', filters], staleTime: 10_000, refetchInterval: 30_000 } });
  const rows = paged ? q.data ?? [] : ws.results;
  const groups = useMemo(() => (athleteId ? buildAthleteProgress(mode, rows.filter((r) => (!metricId || r.metricId === metricId) && (unit === undefined || r.unit === unit) && (protocol === undefined || r.protocol === protocol)), athleteId, ws.metrics) : []), [rows, athleteId, mode, ws.metrics, metricId, unit, protocol]);
  const metricName = metricId ? ws.metrics.find((m) => m.id === metricId)?.name : undefined;
  return <Card>
    <H sub={mode === 'monthly' ? "Monthly shows this athlete's latest result in each month within the selected period. It is not an average." : "Daily shows this athlete's latest result on each testing day."}>{metricName ? `${metricName} progress` : athleteName ? `${athleteName} progress` : 'Athlete progress'}</H>
    <View testID="athlete-progress-mode" style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
      {(['daily', 'monthly'] as const).map((m) => <Pressable key={m} testID={`athlete-progress-${m}`} accessibilityRole="button" accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)} style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: mode === m ? c.primary : c.border, backgroundColor: mode === m ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: mode === m ? '#fff' : c.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{m === 'daily' ? 'Daily' : 'Monthly'}</Text>
      </Pressable>)}
    </View>
    {!athleteId ? <Empty title="No athlete selected" copy="Adjust the filters or search to choose an athlete." /> :
      paged && q.isLoading ? <Skeleton h={180} /> :
      paged && q.isError ? <ErrorBox message="This athlete's history could not load." onRetry={() => void q.refetch()} /> :
      !groups.length ? <View testID="athlete-progress-empty"><Empty title="No results to chart" copy="This athlete has no results for the current category, team and period." /></View> : groups.map((g) => {
        const series: Series[] = g.lines.map((l, i) => ({
          id: l.id, color: COLORS[i % COLORS.length], label: l.showProtocol ? `${l.metricName} (${l.protocol})` : l.metricName,
          points: l.points.map((p) => ({ date: p.date, value: p.value, detail: `${mode === 'monthly' ? p.label : p.date} · ${l.protocol}` })),
        }));
        return <View key={g.id} testID={`athlete-progress-group-${g.category}-${g.unit}`}>
          <LineChart title={`${metricName ?? g.category} (${g.unit})`} unit={g.unit} direction="neutral" decimals={g.lines[0].decimals} caption={`${mode === 'monthly' ? 'Monthly' : 'Daily'} latest result`} series={series} dateLabel={mode === 'monthly' ? monthLabel : undefined} showEndpoints={false} />
        </View>;
      })}
    <Body muted style={{ fontSize: 11 }}>Lines never mix units or protocols. Tap a legend item to hide it, or a point for details.</Body>
  </Card>;
}
