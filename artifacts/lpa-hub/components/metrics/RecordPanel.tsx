import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useRecordPerformanceResults } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Body, Btn, Card, Chip, Confirm, Empty, Field, H, Label, SearchBox, Sheet } from './ui';
import { MetricsWorkspace, errMsg, fmtDate, fmtNum, isUnconfigured, phoenixToday, useBatchId, useInvalidateMetrics } from '@/lib/metrics';

type Cell = { value: string; sets: string; reps: string; notes: string; pub: string; goal: string };
const empty: Cell = { value: '', sets: '', reps: '', notes: '', pub: '', goal: '' };

export function RecordPanel({ ws, category = '', initialAthleteId, initialMetricId }: { ws?: MetricsWorkspace; category?: string; initialAthleteId?: string; initialMetricId?: string }) {
  const c = useColors();
  const invalidate = useInvalidateMetrics();
  const rec = useRecordPerformanceResults();
  const batch = useBatchId();
  const [aSel, setASel] = useState<string[]>(initialAthleteId ? [initialAthleteId] : []); const [mSel, setMSel] = useState<string[]>(initialMetricId ? [initialMetricId] : []);
  const [aq, setAq] = useState('');
  const [date, setDate] = useState(phoenixToday()); const [session, setSession] = useState('');
  const [retest, setRetest] = useState(false); const [confirmRetest, setConfirmRetest] = useState(false);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [detail, setDetail] = useState<string | null>(null);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const athletes = ws?.athletes ?? [];
  const metrics = (ws?.metrics ?? []).filter((m) => m.active && (!category || m.category === category));
  const blocked = metrics.filter(isUnconfigured);
  const entryMetrics = metrics.filter((m) => !isUnconfigured(m));
  const shownAthletes = athletes.filter((a) => a.fullName.toLowerCase().includes(aq.trim().toLowerCase()));
  const rosterKey = athletes.map((a) => a.id).join(',');
  const metricKey = entryMetrics.map((m) => m.id).join(',');
  useEffect(() => {
    if (!ws) return;
    setASel((selected) => selected.filter((id) => athletes.some((a) => a.id === id)));
    setMSel((selected) => selected.filter((id) => entryMetrics.some((m) => m.id === id)));
  }, [rosterKey, metricKey, !!ws]);
  const tog = (l: string[], id: string, s: (x: string[]) => void) => s(l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  const key = (a: string, m: string) => JSON.stringify([a, m]);
  const setCell = (k: string, p: Partial<Cell>) => setCells((o) => ({ ...o, [k]: { ...(o[k] ?? empty), ...p } }));
  const prev = (a: string, m: string) => ws?.summaries.filter((s) => s.athleteId === a && s.metricId === m && s.latest !== null).map((s) => `${fmtNum(s.latest)} ${s.unit} (${fmtDate(s.lastTestingDate)})`).join(' / ');

  const build = () => {
    if (!session.trim()) { setErr('Enter a session name.'); return null; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > phoenixToday()) { setErr('Enter a valid testing date (YYYY-MM-DD) that is not in the future.'); return null; }
    const entries: any[] = [];
    for (const a of aSel) for (const m of mSel) {
      const cell = cells[key(a, m)]; if (!cell || cell.value.trim() === '') continue;
      const metric = entryMetrics.find((x) => x.id === m); const who = athletes.find((x) => x.id === a)?.fullName;
      if (!metric || !who) { setErr('The selected athlete or metric is no longer available in this team/category. Reselect before saving.'); return null; }
      const value = Number(cell.value);
      if (!Number.isFinite(value) || value < 0) { setErr(`Invalid value for ${who} - ${metric.name}.`); return null; }
      if ((metric.dataType === 'integer' || metric.dataType === 'repetitions') && !Number.isInteger(value)) { setErr(`${metric.name} must be a whole number (${who}).`); return null; }
      if (metric.category === 'Health' && cell.goal.trim() && (!Number.isFinite(Number(cell.goal)) || Number(cell.goal) < 0)) { setErr(`Goal must be a positive number (${who}).`); return null; }
      const num = (x: string) => (x.trim() ? Number(x) : null);
      const sets = num(cell.sets), repetitions = num(cell.reps);
      if ((sets !== null && (!Number.isInteger(sets) || sets < 1)) || (repetitions !== null && (!Number.isInteger(repetitions) || repetitions < 1))) { setErr(`Sets and repetitions must be whole numbers (${who}).`); return null; }
      entries.push({ athleteId: a, metricId: m, value, sets, repetitions, notes: cell.notes, publicNotes: cell.pub, ...(metric.category === 'Health' ? { goal: cell.goal.trim() ? Number(cell.goal) : null } : {}) });
    }
    if (!entries.length) { setErr('Enter at least one result.'); return null; }
    return entries;
  };
  const exists = () => (ws?.results ?? []).some((r) => r.testingDate.slice(0, 10) === date && aSel.includes(r.athleteId) && mSel.includes(r.metricId));
  const submit = (allowed: boolean) => {
    setErr(''); setOk('');
    const entries = build(); if (!entries) return;
    if (!allowed && !retest && exists()) { setErr('Some athletes already have a result for this metric on this date. Turn on "Allow retest" to record another.'); return; }
    if (retest && !allowed) { setConfirmRetest(true); return; }
    rec.mutate({ data: { sessionId: batch.get(), sessionName: session.trim(), testingDate: date, allowRetest: retest, entries } }, {
      onSuccess: (r) => { batch.renew(); void invalidate(); setCells({}); setRetest(false); setOk(`Saved ${r.length} result${r.length === 1 ? '' : 's'}.`); },
      onError: (e) => setErr(`${errMsg(e)} Your entries are kept; you can retry safely.`),
    });
  };
  const d = detail ? cells[detail] ?? empty : empty;
  return <View>
    <H sub="Pick athletes and metrics, then fill the grid. Health entries are neutral tracking, not medical advice. Athletes come from the Athlete tag and the team filter.">Record results</H>
    {blocked.length ? <Card><Body style={{ color: c.primary }}>Entry is blocked for: {blocked.map((m) => m.name).join(', ')}. Configure the equipment unit in the Metrics Library first.</Body></Card> : null}
    <Card>
      <Label>Athletes ({aSel.length} selected)</Label>
      <SearchBox value={aq} onChange={setAq} placeholder="Search athletes" />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}><Btn label="Select shown" kind="ghost" onPress={() => setASel([...new Set([...aSel, ...shownAthletes.map((a) => a.id)])])} /><Btn label="Clear" kind="ghost" onPress={() => setASel([])} /></View>
      {!athletes.length ? <Empty title="No athletes" copy="No people with the Athlete tag match this team." /> : <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{shownAthletes.slice(0, 120).map((a) => <Chip key={a.id} label={a.fullName} active={aSel.includes(a.id)} onPress={() => tog(aSel, a.id, setASel)} />)}</View>}
      <Label>Metrics ({mSel.length} selected)</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{entryMetrics.map((m) => <Chip key={m.id} label={`${m.name} (${m.unit})`} active={mSel.includes(m.id)} onPress={() => tog(mSel, m.id, setMSel)} />)}</View>
    </Card>
    <Card>
      <View style={{ flexDirection: 'row', gap: 8 }}><Field label="Testing date" value={date} onChangeText={setDate} autoCapitalize="none" /><Field label="Session name" value={session} onChangeText={setSession} placeholder="Spring combine" /></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Switch value={retest} onValueChange={setRetest} /><Body style={{ flex: 1 }}>Allow retest on a day that already has results</Body></View>
    </Card>
    {aSel.length && mSel.length ? <Card>
      <Label>Results grid</Label>
      <ScrollView horizontal><View>
        <View style={{ flexDirection: 'row' }}><View style={{ width: 140 }} />{mSel.map((m) => <Text key={m} style={{ width: 130, color: c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>{metrics.find((x) => x.id === m)?.name} ({metrics.find((x) => x.id === m)?.unit})</Text>)}</View>
        {aSel.map((a) => <View key={a} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 }}>
          <Text style={{ width: 140, color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, paddingTop: 12 }} numberOfLines={2}>{athletes.find((x) => x.id === a)?.fullName}</Text>
          {mSel.map((m) => { const k = key(a, m); const p = prev(a, m); return <View key={m} style={{ width: 130, paddingRight: 8 }}>
            <TextInput testID={`cell-${k}`} value={cells[k]?.value ?? ''} onChangeText={(v) => setCell(k, { value: v })} keyboardType="decimal-pad" placeholder="Value" placeholderTextColor={c.mutedForeground} style={{ minHeight: 40, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10, color: c.foreground, backgroundColor: c.background }} />
            <Text style={{ color: c.mutedForeground, fontSize: 10, marginTop: 2 }}>{p ? `Prev ${p}` : 'No previous'}</Text>
            <Text onPress={() => setDetail(k)} style={{ color: c.primary, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Sets, reps, notes</Text></View>; })}
        </View>)}
      </View></ScrollView>
    </Card> : null}
    {err ? <Body style={{ color: c.destructive, marginBottom: 8 }}>{err}</Body> : null}
    {ok ? <Body style={{ color: c.accent, marginBottom: 8 }}>{ok}</Body> : null}
    <Btn label="Save results" icon="check" loading={rec.isPending} disabled={!aSel.length || !mSel.length} onPress={() => submit(false)} testID="save-results" />
    <Confirm visible={confirmRetest} title="Record a retest?" copy={`Results will be saved as an additional session on ${fmtDate(date)}. Existing results stay in the history.`} confirmLabel="Record retest" onCancel={() => setConfirmRetest(false)} onConfirm={() => { setConfirmRetest(false); submit(true); }} />
    <Sheet visible={!!detail} title="Result details" onClose={() => setDetail(null)}>
      <View style={{ flexDirection: 'row', gap: 8 }}><Field label="Sets" value={d.sets} onChangeText={(v) => detail && setCell(detail, { sets: v })} keyboardType="number-pad" /><Field label="Repetitions" value={d.reps} onChangeText={(v) => detail && setCell(detail, { reps: v })} keyboardType="number-pad" /></View>
      {detail && metrics.find((m) => m.id === (JSON.parse(detail) as string[])[1])?.category === 'Health' ? <Field label="Goal (optional recorded target; not a recommendation)" value={d.goal} onChangeText={(v) => setCell(detail, { goal: v })} keyboardType="decimal-pad" /> : null}
      <Field label="Internal notes (staff only, never in reports)" value={d.notes} onChangeText={(v) => detail && setCell(detail, { notes: v })} multiline />
      <Field label="Public notes (parent-friendly, shown in published reports)" value={d.pub} onChangeText={(v) => detail && setCell(detail, { pub: v })} multiline />
      <Btn label="Done" onPress={() => setDetail(null)} />
    </Sheet>
  </View>;
}
