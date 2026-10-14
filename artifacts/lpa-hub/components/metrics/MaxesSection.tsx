import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { MetricsWorkspace, MetricMax, PerformanceResult } from '@/lib/metrics';
import { fmtDate, fixed, selectedMetrics } from '@/lib/metrics';
import { Body, Card, Empty, H } from './ui';

function rankFullHistory(ws: MetricsWorkspace): MetricMax[] {
  const names = new Map(ws.athletes.map((athlete) => [athlete.id, athlete.fullName]));
  const bestByAthlete = new Map<string, PerformanceResult>();
  for (const result of ws.results) {
    if (!Number.isFinite(result.value) || result.value < 0 || result.value > 1e9) continue;
    const key = JSON.stringify([result.metricId, result.unit, result.protocol, result.athleteId]);
    const current = bestByAthlete.get(key);
    const tieWinner = current && result.value === current.value &&
      (result.testingDate > current.testingDate ||
        (result.testingDate === current.testingDate && (result.createdAt > current.createdAt ||
          (result.createdAt === current.createdAt && result.id > current.id))));
    if (!current || result.value > current.value || tieWinner) bestByAthlete.set(key, result);
  }
  const groups = new Map<string, PerformanceResult[]>();
  for (const result of bestByAthlete.values()) {
    const key = JSON.stringify([result.metricId, result.unit, result.protocol]);
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  const ranked: MetricMax[] = [];
  for (const rows of groups.values()) {
    rows.sort((a, b) => b.value - a.value ||
      (names.get(a.athleteId) ?? a.athleteId).toLowerCase().localeCompare((names.get(b.athleteId) ?? b.athleteId).toLowerCase()) ||
      a.athleteId.localeCompare(b.athleteId));
    rows.slice(0, 5).forEach((result, index) => ranked.push({
      athleteId: result.athleteId, metricId: result.metricId, value: result.value, unit: result.unit,
      protocol: result.protocol, testingDate: result.testingDate, rank: index + 1,
    }));
  }
  return ranked;
}

export function MaxesSection({ ws }: { ws?: MetricsWorkspace }) {
  const c = useColors();
  if (!ws) return null;
  const maxes = ws.maxes ?? (ws.historyPaged ? null : rankFullHistory(ws));
  const metrics = selectedMetrics(ws);

  return <View testID="team-kpi-maxes">
    <Card>
      <H sub="Highest recorded result per athlete in the selected team and date range. Different units or protocols are ranked separately.">Maxes</H>
      {maxes === null ? <Empty title="Maxes are unavailable" copy="Update the LPA Metrics API to load complete rankings for these filters." />
        : !metrics.length ? <Empty title="No metrics selected" copy="Select metrics or a different category in the filters." />
        : metrics.map((metric) => {
          const variants = new Map<string, { unit: string; protocol: string; rows: MetricMax[] }>();
          maxes.filter((row) => row.metricId === metric.id).forEach((row) => {
            const key = JSON.stringify([row.unit, row.protocol]);
            const variant = variants.get(key) ?? { unit: row.unit, protocol: row.protocol, rows: [] };
            variant.rows.push(row);
            variants.set(key, variant);
          });
          const tables = [...variants.values()].sort((a, b) => a.unit.localeCompare(b.unit) || a.protocol.localeCompare(b.protocol));

          return <View key={metric.id} testID={`maxes-metric-${metric.id}`} style={styles.metric}>
            <View style={[styles.metricHeading, { borderTopColor: c.border }]}>
              <Text style={[styles.metricTitle, { color: c.foreground }]}>{metric.name}</Text>
            </View>
            {!tables.length ? <Text style={[styles.noResults, { color: c.mutedForeground }]}>No recorded results in this date range.</Text>
              : tables.map((table) => <View key={`${table.unit}:${table.protocol}`} style={styles.variant}>
                <Text style={[styles.variantTitle, { color: c.mutedForeground }]}>{table.unit}{table.protocol ? ` · ${table.protocol}` : ''}</Text>
                <View style={[styles.table, { borderColor: c.border }]}>
                  <View style={[styles.row, styles.headerRow, { borderBottomColor: c.border, backgroundColor: c.muted }]}>
                    <Text style={[styles.rank, styles.headerText, { color: c.mutedForeground }]}>Rank</Text>
                    <Text style={[styles.athlete, styles.headerText, { color: c.mutedForeground }]}>Athlete</Text>
                    <Text style={[styles.result, styles.headerText, { color: c.mutedForeground }]}>Result</Text>
                    <Text style={[styles.date, styles.headerText, { color: c.mutedForeground }]}>Date</Text>
                  </View>
                  {table.rows.sort((a, b) => a.rank - b.rank).map((row) => {
                    const athlete = ws.athletes.find((person) => person.id === row.athleteId)?.fullName ?? 'Athlete';
                    return <View key={row.athleteId} testID={`maxes-row-${metric.id}-${row.unit}-${row.protocol}-${row.athleteId}`}
                      accessibilityLabel={`Rank ${row.rank}, ${athlete}, ${fixed(row.value, metric.decimals)} ${row.unit}, ${fmtDate(row.testingDate)}`}
                      style={[styles.row, { borderBottomColor: c.border }]}>
                      <Text style={[styles.rank, styles.rankText, { color: row.rank === 1 ? c.primary : c.mutedForeground }]}>{row.rank}</Text>
                      <Text style={[styles.athlete, styles.athleteText, { color: c.foreground }]} numberOfLines={1}>{athlete}</Text>
                      <Text style={[styles.result, styles.resultText, { color: c.foreground }]} numberOfLines={1}>{fixed(row.value, metric.decimals)} <Text style={[styles.unit, { color: c.mutedForeground }]}>{row.unit}</Text></Text>
                      <Text style={[styles.date, styles.dateText, { color: c.mutedForeground }]} numberOfLines={1}>{fmtDate(row.testingDate)}</Text>
                    </View>;
                  })}
                </View>
              </View>)}
          </View>;
        })}
      {maxes !== null && metrics.length ? <Body muted style={{ fontSize: 10, marginTop: 10 }}>One highest result per athlete is shown for each metric, unit, and protocol.</Body> : null}
    </Card>
  </View>;
}

const styles = StyleSheet.create({
  metric: { marginTop: 14 },
  metricHeading: { paddingTop: 13, marginBottom: 5, borderTopWidth: StyleSheet.hairlineWidth },
  metricTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  variant: { marginTop: 7 },
  variantTitle: { fontFamily: 'Inter_500Medium', fontSize: 10, marginBottom: 5 },
  table: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  row: { minHeight: 40, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { minHeight: 32 },
  headerText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.3 },
  rank: { width: 39 },
  athlete: { flex: 1, minWidth: 0 },
  result: { width: 81, textAlign: 'right' },
  date: { width: 76, textAlign: 'right' },
  rankText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  athleteText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  resultText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  unit: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  dateText: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  noResults: { fontFamily: 'Inter_400Regular', fontSize: 11, paddingVertical: 11 },
});
