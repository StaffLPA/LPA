import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useCreatePerformanceReport, useListPerformanceReports, usePublishPerformanceReport } from '@workspace/api-client-react';
import type { PerformanceReport } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Body, Btn, Card, Chip, Confirm, Empty, ErrorBox, Field, H, Label, Skeleton } from './ui';
import { Filters, MetricsWorkspace, errMsg, filterParams, fmtDate, periodOf, useInvalidateMetrics } from '@/lib/metrics';

export function ReportList({ canManage }: { canManage: boolean }) {
  const c = useColors(); const router = useRouter(); const invalidate = useInvalidateMetrics();
  const { user } = useApp(); const [ask, setAsk] = useState<PerformanceReport | null>(null);
  const q = useListPerformanceReports({ query: { queryKey: ['/api/metrics/reports', user?.id ?? 'anon'], refetchInterval: 30_000 } as never });
  const pub = usePublishPerformanceReport({ mutation: { onSuccess: () => void invalidate() } });
  const rows = (q.data ?? []) as PerformanceReport[];
  if (q.isLoading) return <Skeleton />;
  if (q.isError) return <ErrorBox message="Reports could not load." onRetry={() => void q.refetch()} />;
  if (!rows.length) return <Empty title="No reports yet" copy={canManage ? 'Create a snapshot report from the current filters.' : 'Published performance reports will appear here.'} />;
  return <View>{rows.map((r) => <Card key={r.id}>
    <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{r.title}</Text>
    <Body muted style={{ fontSize: 12 }}>{fmtDate(r.createdAt)} · {r.athleteIds.length} athlete{r.athleteIds.length === 1 ? '' : 's'}{canManage ? ` · ${r.published ? 'Published' : 'Draft'}` : ''}</Body>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <Btn label="Open" kind="ghost" onPress={() => router.push(`/metrics/report/${r.id}` as never)} />
      {canManage ? <Btn label={r.published ? 'Withdraw' : 'Publish'} kind={r.published ? 'danger' : 'primary'} loading={pub.isPending && pub.variables?.id === r.id} disabled={!r.published && r.athleteIds.length !== 1} onPress={() => setAsk(r)} /> : null}
    </View>
    {canManage && r.athleteIds.length !== 1 ? <Body muted style={{ fontSize: 11 }}>Team reports are staff-only and cannot be published. Publish single-athlete reports for families.</Body> : null}
    {pub.isError && pub.variables?.id === r.id ? <Body style={{ color: c.destructive }}>{errMsg(pub.error)}</Body> : null}
  </Card>)}<Confirm visible={!!ask} title={ask?.published ? 'Withdraw report?' : 'Publish report?'} copy={ask?.published ? 'The athlete and parents will no longer see this report.' : 'The athlete and authorized parents will be able to see this single-athlete report (public notes only). No notification is sent.'} confirmLabel={ask?.published ? 'Withdraw' : 'Publish'} onCancel={() => setAsk(null)} onConfirm={() => { if (ask) pub.mutate({ id: ask.id, data: { published: !ask.published } }); setAsk(null); }} /></View>;
}

export function ReportsPanel({ ws, f }: { ws?: MetricsWorkspace; f: Filters }) {
  const c = useColors(); const invalidate = useInvalidateMetrics(); const router = useRouter();
  const create = useCreatePerformanceReport();
  const [title, setTitle] = useState(''); const [publish, setPublish] = useState(false);
  const [mSel, setMSel] = useState<string[] | null>(null); const [aSel, setASel] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  const scope = JSON.stringify(filterParams(f));
  useEffect(() => { setMSel(null); setASel(null); setPublish(false); setErr(''); }, [scope]);
  const metricsAvail = (ws?.metrics ?? []).filter((m) => ws?.summaries.some((s) => s.metricId === m.id) || ws?.results.some((r) => r.metricId === m.id));
  const athletesAvail = (ws?.athletes ?? []).filter((a) => ws?.selectedAthleteIds.includes(a.id));
  const mIds = mSel ?? metricsAvail.map((m) => m.id); const aIds = aSel ?? athletesAvail.map((a) => a.id);
  const tog = (l: string[], id: string) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  const save = () => {
    if (!title.trim()) return setErr('Give the report a title.');
    if (!mIds.length || !aIds.length) return setErr('Select at least one athlete and one metric with data.');
    const p = filterParams(f); const { start, end } = periodOf(f);
    create.mutate({ data: { title: title.trim(), team: p.team, athleteIds: aIds, metricIds: mIds, start, end, category: p.category, coachId: p.coachId, published: publish && aIds.length === 1 } }, {
      onSuccess: (r) => { void invalidate(); setTitle(''); setErr(''); setMSel(null); setASel(null); router.push(`/metrics/report/${r.id}` as never); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  return <View>
    <H sub="A report is a snapshot of the filters above. Only public notes are included; internal notes never are.">Reports and progress</H>
    <Card>
      <Field label="Report title" value={title} onChangeText={setTitle} placeholder="Fall testing progress" />
      <Label>Metrics ({mIds.length})</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{metricsAvail.map((m) => <Chip key={m.id} label={m.name} active={mIds.includes(m.id)} onPress={() => setMSel(tog(mIds, m.id))} />)}</View>
      <Label>Athletes ({aIds.length})</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{athletesAvail.slice(0, 100).map((a) => <Chip key={a.id} label={a.fullName} active={aIds.includes(a.id)} onPress={() => setASel(tog(aIds, a.id))} />)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{aIds.length === 1 ? <Chip label={publish ? 'Publish immediately' : 'Save as draft'} active={publish} onPress={() => setPublish(!publish)} /> : <Body muted style={{ fontSize: 11 }}>Reports with more than one athlete are staff-only drafts. Select a single athlete to publish to a family.</Body>}</View>
      {err ? <Body style={{ color: c.destructive, marginBottom: 8 }}>{err}</Body> : null}
      <Btn label="Create report" icon="file-text" loading={create.isPending} onPress={save} />
    </Card>
    <ReportList canManage />
  </View>;
}
