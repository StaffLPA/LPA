import React from 'react';
import { Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Body, Btn, Card, Empty, H } from './ui';
import { MetricsWorkspace, fixed, fmtDate, fmtNum } from '@/lib/metrics';

export function OverviewPanel({ ws, onTab }: { ws?: MetricsWorkspace; onTab?: (t: string) => void }) {
  const c = useColors(); const router = useRouter();
  const sessions = [...new Map((ws?.results ?? []).map((r) => [r.sessionId, r] as const)).values()].sort((a, b) => b.testingDate.localeCompare(a.testingDate)).slice(0, 5).map((r) => ({ r, n: (ws?.results ?? []).filter((x) => x.sessionId === r.sessionId).length }));
  const pbs = (ws?.summaries ?? []).filter((s) => s.personalBestInPeriod && ws?.metrics.find((m) => m.id === s.metricId)?.direction !== 'neutral').slice(0, 6);
  const stats = [['Results', ws?.totalResults], ['Athletes tested', ws?.athletesTested], ['Active metrics', ws?.activeMetrics], ['Roster', ws?.athletes.length]] as const;
  const recent = [...(ws?.results ?? [])].sort((a, b) => b.testingDate.localeCompare(a.testingDate) || b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  return <View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
      {stats.map(([l, v]) => <View key={l} style={{ flexGrow: 1, flexBasis: 140, borderWidth: 1, borderRadius: 14, padding: 14, backgroundColor: c.card, borderColor: c.border }}>
        <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{l}</Text>
        <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 28, marginTop: 4 }}>{v === undefined ? '-' : fmtNum(v)}</Text></View>)}
    </View>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}><Btn label="Team KPI dashboard" kind="ghost" onPress={() => onTab?.('Team KPI Dashboard')} /><Btn label="Reports" kind="ghost" onPress={() => onTab?.('Reports & Progress')} /></View>
    <H sub="Latest testing sessions in the current filters.">Recent sessions</H>
    {!sessions.length ? <Empty title="No sessions" copy="Record results to see sessions." /> : sessions.map(({ r, n }) => <Card key={r.sessionId} style={{ padding: 12 }}><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{r.sessionName}</Text><Body muted style={{ fontSize: 12 }}>{fmtDate(r.testingDate)} · {n} result{n === 1 ? '' : 's'} · {r.recorderName}</Body></Card>)}
    <H sub="Neutral metrics never show personal bests.">Recent personal bests</H>
    {!pbs.length ? <Empty title="No personal bests yet" /> : pbs.map((s) => <Pressable key={`${s.athleteId}${s.metricId}${s.protocol}`} onPress={() => router.push(`/metrics/athlete/${s.athleteId}` as never)}><Card style={{ padding: 12 }}><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{ws?.athletes.find((a) => a.id === s.athleteId)?.fullName} · {ws?.metrics.find((m) => m.id === s.metricId)?.name}</Text><Body muted style={{ fontSize: 12 }}>{fixed(s.best, ws?.metrics.find((m) => m.id === s.metricId)?.decimals)} {s.unit} · {fmtDate(s.lastTestingDate)}</Body></Card></Pressable>)}
    <H sub="Most recent testing in the current filters.">Recent testing activity</H>
    {!recent.length ? <Empty title="No testing yet" copy="Record results to see activity here." /> : recent.map((r) => <Pressable key={r.id} onPress={() => router.push(`/metrics/athlete/${r.athleteId}` as never)}><Card style={{ padding: 12 }}>
      <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{ws?.athletes.find((a) => a.id === r.athleteId)?.fullName ?? 'Athlete'} · {ws?.metrics.find((m) => m.id === r.metricId)?.name}</Text>
      <Body muted style={{ fontSize: 12 }}>{fmtNum(r.value)} {r.unit} · {fmtDate(r.testingDate)} · {r.sessionName} · {r.recorderName}</Body></Card></Pressable>)}
  </View>;
}
