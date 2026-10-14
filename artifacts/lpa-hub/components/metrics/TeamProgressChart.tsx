import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Body, Card, Empty, H } from './ui';
import { LineChart, Series } from './LineChart';
import { MetricsWorkspace } from '@/lib/metrics';
import { TpMode, buildTeamProgress, monthLabel } from '@/lib/teamProgress';

const COLORS = ['#C97A4A', '#9BC7BD', '#E7C65B', '#8AA2D6', '#C98AB8', '#7FB77E', '#D6A06B', '#A78BDA'];

export function TeamProgressChart({ ws }: { ws?: MetricsWorkspace }) {
  const c = useColors();
  const [mode, setMode] = useState<TpMode>('monthly');
  const groups = useMemo(() => ws ? buildTeamProgress(mode, ws.trends, ws.results, ws.metrics, ws.monthlyTrends) : [], [ws, mode]);
  if (!ws) return null;
  return <Card>
    <H sub={mode === 'monthly' ? 'Monthly uses each athlete\'s latest result in the month within the selected period, averaged once per athlete.' : 'Daily shows the team average per testing day with the number of athletes tested.'}>Team progress</H>
    <View testID="team-progress-mode" style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
      {(['daily', 'monthly'] as const).map((m) => <Pressable key={m} testID={`team-progress-${m}`} accessibilityRole="button" accessibilityLabel={m === 'daily' ? 'Daily' : 'Monthly'} accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)} style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: mode === m ? c.primary : c.border, backgroundColor: mode === m ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: mode === m ? '#fff' : c.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{m === 'daily' ? 'Daily' : 'Monthly'}</Text>
      </Pressable>)}
    </View>
    {!groups.length ? <View testID="team-progress-empty"><Empty title="No progress to chart yet" copy="Record results or widen the filters. Nothing is shown until real results exist." /></View> : groups.map((g) => {
      const series: Series[] = g.lines.map((l, i) => ({
        id: l.id, color: COLORS[i % COLORS.length], label: l.showProtocol ? `${l.metricName} (${l.protocol})` : l.metricName,
        points: l.points.map((p) => ({ date: p.date, value: p.value, detail: `${mode === 'monthly' ? p.label : p.date} · ${p.sampleSize} athlete${p.sampleSize === 1 ? '' : 's'} · ${l.protocol}` })),
      }));
      return <View key={g.id} testID={`team-progress-group-${g.category}-${g.unit}`}>
        <LineChart title={`${g.category} (${g.unit})`} unit={g.unit} direction="neutral" decimals={g.lines[0].decimals} caption={`${mode === 'monthly' ? 'Monthly' : 'Daily'} team average`} series={series} dateLabel={mode === 'monthly' ? monthLabel : undefined} showEndpoints={false} />
      </View>;
    })}
    <Body muted style={{ fontSize: 11 }}>Lines never mix units or protocols. Tap a legend item to hide it, or a point for date, value and athlete count.</Body>
  </Card>;
}
