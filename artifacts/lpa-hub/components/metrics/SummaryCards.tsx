import React from 'react';
import { Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MetricsWorkspace, fmtNum } from '@/lib/metrics';

export function SummaryCards({ ws }: { ws?: MetricsWorkspace }) {
  const c = useColors();
  const nonNeutral = (id: string) => ws?.metrics.find((m) => m.id === id)?.direction !== 'neutral';
  const pbs = (ws?.summaries ?? []).filter((s) => s.personalBestInPeriod && nonNeutral(s.metricId)).length;
  const metricsWith = new Set((ws?.summaries ?? []).map((s) => s.metricId)).size;
  const items: [string, number | undefined][] = [['Athletes included', ws?.selectedAthleteIds.length], ['Athletes tested', ws?.athletesTested], ['Metrics with results', metricsWith], ['Results', ws?.totalResults], ['Personal bests', pbs]];
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>{items.map(([l, v]) => <View key={l} style={{ flexGrow: 1, flexBasis: 120, borderWidth: 1, borderRadius: 14, padding: 12, backgroundColor: c.card, borderColor: c.border }}>
    <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>{l}</Text>
    <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 24 }}>{v === undefined ? '-' : fmtNum(v)}</Text></View>)}</View>;
}
