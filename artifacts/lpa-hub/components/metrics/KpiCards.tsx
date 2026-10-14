import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { BAD, Body, Empty, GOOD, H, useWide } from './ui';
import { Group, MetricsWorkspace, fixed, fmtPct, groupSummaries, kpiOf, latestTeamAverage, selectedMetrics } from '@/lib/metrics';

export function KpiCards({ ws, title = 'Key performance exercises', label = 'Group Average', renderGraph, showDetails = true, teamWorkspace, teamLabel, showTeamAverage = false }: { ws?: MetricsWorkspace; title?: string; label?: string; renderGraph?: (metricId: string, unit: string, protocol?: string) => React.ReactNode; showDetails?: boolean; teamWorkspace?: MetricsWorkspace; teamLabel?: string; showTeamAverage?: boolean }) {
  const c = useColors();
  const { w, onLayout } = useWide();
  const groups = groupSummaries(ws);
  const byMetric = new Map<string, Group[]>();
  groups.forEach((g) => byMetric.set(g.metric.id, [...(byMetric.get(g.metric.id) ?? []), g]));
  const cards: { key: string; metricId: string; name: string; suffix: string; unit: string; g?: Group; dec?: number }[] = [];
  selectedMetrics(ws).forEach((m) => {
    const gs = byMetric.get(m.id);
    if (!gs) { if (m.active) cards.push({ key: m.id, metricId: m.id, name: m.name, suffix: '', unit: m.unit, dec: m.decimals }); return; }
    gs.forEach((g) => cards.push({ key: g.key, metricId: m.id, name: m.name, suffix: gs.length > 1 ? ` · ${g.protocol}` : '', unit: g.unit, g, dec: m.decimals }));
  });
  const total = ws?.selectedAthleteIds.length ?? 0;
  const cols = renderGraph ? (w >= 900 ? 2 : 1) : w >= 900 ? 3 : w >= 520 ? 2 : 1;
  const subtitle = label === 'Latest'
    ? "Latest result and baseline for this athlete. Team averages use each team member's latest result in the selected date range; incompatible units and protocols stay separate."
    : "Group average of each athlete's latest result. Baseline is the average of the same athletes' previous results, so the percentage matches the numbers shown; dashes mean not enough data.";
  return <View onLayout={onLayout}>
    <H sub={subtitle}>{title}</H>
    {!cards.length ? <Empty title="No metrics selected" copy="Select metrics or a different category in the filters." /> : <View style={styles.grid}>
      {cards.map((card) => {
        const k = card.g ? kpiOf(card.g, total) : { current: null, baseline: null, pct: null, improved: null, tested: 0, paired: 0, missing: total, counts: {} as Record<string, number>, pbs: 0 };
        const teamAverage = card.g ? latestTeamAverage(teamWorkspace, card.metricId, card.unit, card.g.protocol) : null;
        const col = k.improved === null ? c.mutedForeground : k.improved ? GOOD : BAD;
        const arrow = k.pct === null || k.pct === 0 ? 'arrow-up' : k.pct > 0 ? 'arrow-up' : 'chevron-down';
        return <View key={card.key} testID={`kpi-${card.key}`} style={[styles.card, { width: `${100 / cols - 1.5}%`, backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.metric, { color: c.mutedForeground }]} numberOfLines={1}>{card.name}{card.suffix}</Text>
          <Text style={[styles.avg, { color: c.foreground }]}>{label}{card.unit ? ` (${card.unit})` : ''}</Text>
          <Text style={[styles.big, { color: c.foreground }]}>{fixed(k.current, card.dec)}</Text>
          <View style={styles.row}>
            <Text style={[styles.base, { color: c.mutedForeground }]}>Baseline {fixed(k.baseline, card.dec)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              {k.pct !== null && k.pct !== 0 ? <View style={k.pct < 0 ? { transform: [{ rotate: '0deg' }] } : undefined}><Feather name={arrow} size={14} color={col} /></View> : null}
              <Text style={[styles.pct, { color: k.pct === null ? c.mutedForeground : col }]}>{fmtPct(k.pct)}</Text>
            </View>
          </View>
          {showTeamAverage && teamLabel ? <Text testID={`team-average-${card.key}`} style={[styles.teamAverage, { color: c.mutedForeground }]} numberOfLines={2}>
            Avg {card.name}{card.suffix} {teamLabel}: {fixed(teamAverage, card.dec)}{card.unit ? ` ${card.unit}` : ''}
          </Text> : null}
          {showDetails ? <>
            <Text style={[styles.n, { color: c.mutedForeground }]}>{k.paired ? `Current and baseline use the same ${k.paired} paired athlete${k.paired === 1 ? '' : 's'}.` : k.tested ? 'Current from tested athletes; no retest yet, so no baseline.' : 'No results.'} Tested {k.tested} · Paired {k.paired} · Missing {k.missing}</Text>
            {card.g ? <Text style={[styles.n, { color: c.mutedForeground }]}>Improved {k.counts.improved ?? 0} · Declined {k.counts.declined ?? 0} · Unchanged {k.counts.unchanged ?? 0} · Insufficient {k.counts.insufficient ?? 0}{card.g.metric.direction === 'neutral' ? ' · No better/worse for this metric' : ` · Personal bests ${k.pbs}`}</Text> : null}
          </> : null}
          {renderGraph?.(card.metricId, card.unit, card.g?.protocol)}
        </View>;
      })}
    </View>}
    <Body muted style={{ fontSize: 11, marginTop: 4 }}>Different units or protocols are shown as separate cards and are never combined.</Body>
  </View>;
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 130 },
  metric: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  avg: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 2 },
  big: { fontFamily: 'Inter_700Bold', fontSize: 36, marginVertical: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  base: { fontFamily: 'Inter_500Medium', fontSize: 15 },
  teamAverage: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 7 },
  n: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 6, lineHeight: 14 },
  pct: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});
