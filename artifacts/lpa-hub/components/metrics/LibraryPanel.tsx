import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useCreatePerformanceMetric, useUpdatePerformanceMetric } from '@workspace/api-client-react';
import type { PerformanceMetric } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Body, Btn, Card, Chip, Empty, Field, H, Label, Sheet, SearchBox, Confirm } from './ui';
import { AuditSheet } from './AuditSheet';
import { errMsg, isUnconfigured, useInvalidateMetrics } from '@/lib/metrics';

const TYPES = ['integer', 'decimal', 'time', 'repetitions'] as const;
const DIRS = ['higher', 'lower', 'neutral'] as const;
type Form = { name: string; category: string; unit: string; dataType: (typeof TYPES)[number]; direction: (typeof DIRS)[number]; decimals: string; active: boolean; description: string; instructions: string; protocol: string };
const blank: Form = { name: '', category: '', unit: '', dataType: 'decimal', direction: 'higher', decimals: '1', active: true, description: '', instructions: '', protocol: 'Standard' };

export function LibraryPanel({ metrics }: { metrics: PerformanceMetric[] }) {
  const c = useColors();
  const invalidate = useInvalidateMetrics();
  const create = useCreatePerformanceMetric();
  const update = useUpdatePerformanceMetric();
  const [q, setQ] = useState(''); const [edit, setEdit] = useState<PerformanceMetric | 'new' | null>(null);
  const [f, setF] = useState<Form>(blank); const [err, setErr] = useState('');
  const [audit, setAudit] = useState<string | null>(null); const [deact, setDeact] = useState<PerformanceMetric | null>(null);
  const open = (m: PerformanceMetric | 'new') => { setErr(''); setEdit(m); setF(m === 'new' ? blank : { name: m.name, category: m.category, unit: isUnconfigured(m) ? '' : m.unit, dataType: m.dataType, direction: m.direction, decimals: String(m.decimals), active: m.active, description: m.description ?? '', instructions: m.instructions ?? '', protocol: m.protocol }); };
  const save = () => {
    const decimals = Number(f.decimals);
    if (!f.name.trim() || !f.category.trim() || !f.unit.trim() || !f.protocol.trim()) return setErr('Name, category, unit and protocol are required.');
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) return setErr('Decimals must be 0 to 6.');
    const data = { name: f.name.trim(), category: f.category.trim(), unit: f.unit.trim(), dataType: f.dataType, direction: f.direction, decimals, active: f.active, description: f.description, instructions: f.instructions, protocol: f.protocol.trim() };
    const done = { onSuccess: () => { void invalidate(); setEdit(null); }, onError: (e: unknown) => setErr(errMsg(e)) };
    if (edit === 'new') create.mutate({ data }, done);
    else if (edit) update.mutate({ id: edit.id, data: { ...data, revision: edit.revision } }, done);
  };
  const toggle = (m: PerformanceMetric) => update.mutate({ id: m.id, data: { name: m.name, category: m.category, unit: m.unit, dataType: m.dataType, direction: m.direction, decimals: m.decimals, description: m.description, instructions: m.instructions, protocol: m.protocol, active: !m.active, revision: m.revision } }, { onSuccess: () => { void invalidate(); setDeact(null); }, onError: (e) => { setDeact(null); setErr(errMsg(e)); } });
  const list = metrics.filter((m) => `${m.name} ${m.category}`.toLowerCase().includes(q.trim().toLowerCase()));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  return <View>
    <H sub="Deactivating hides a metric from new testing; history and reports are kept.">Metrics library</H>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}><View style={{ flex: 1 }}><SearchBox value={q} onChange={setQ} placeholder="Search metrics or category" /></View><Btn label="New metric" icon="plus" onPress={() => open('new')} /></View>
    {err && !edit ? <Body style={{ color: c.destructive, marginBottom: 8 }}>{err}</Body> : null}
    {!list.length ? <Empty title="No metrics" copy="Create a custom metric to start testing." /> : list.map((m) => <Card key={m.id} style={{ opacity: m.active ? 1 : 0.65 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{m.name}</Text>
        <Body muted style={{ fontSize: 12 }}>{m.category} · {isUnconfigured(m) ? 'Unit not configured' : m.unit} · {m.dataType} · {m.direction === 'higher' ? 'higher is better' : m.direction === 'lower' ? 'lower is better' : 'neutral'}</Body></View>
        <Text style={{ color: m.active ? c.accent : c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 10 }}>{m.active ? 'ACTIVE' : 'INACTIVE'}</Text></View>
      {isUnconfigured(m) ? <Body style={{ color: c.primary, fontSize: 12, marginTop: 4 }}>Configure the equipment unit before results can be recorded.</Body> : null}
      {m.instructions ? <Body muted style={{ fontSize: 12, marginTop: 4 }}>{m.instructions}</Body> : null}
      <Body muted style={{ fontSize: 11, marginTop: 4 }}>{m.standard ? 'Standard metric' : 'Custom metric'} · revision {m.revision}</Body>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <Btn label={isUnconfigured(m) ? 'Configure unit' : 'Edit'} kind="ghost" onPress={() => open(m)} />
        <Btn label={m.active ? 'Deactivate' : 'Reactivate'} kind={m.active ? 'danger' : 'ghost'} onPress={() => (m.active ? setDeact(m) : toggle(m))} />
        <Btn label="History" kind="ghost" onPress={() => setAudit(m.id)} />
      </View>
    </Card>)}
    <Sheet visible={!!edit} title={edit === 'new' ? 'New metric' : 'Edit metric'} onClose={() => setEdit(null)}>
      <Field label="Name" value={f.name} onChangeText={(v) => set('name', v)} />
      <View style={{ flexDirection: 'row', gap: 8 }}><Field label="Category" value={f.category} onChangeText={(v) => set('category', v)} /><Field label="Unit" value={f.unit} onChangeText={(v) => set('unit', v)} autoCapitalize="none" /></View>
      <Label>Data type</Label><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{TYPES.map((t) => <Chip key={t} label={t} active={f.dataType === t} onPress={() => set('dataType', t)} />)}</View>
      <Label>Performance direction</Label><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{DIRS.map((t) => <Chip key={t} label={t === 'higher' ? 'Higher is better' : t === 'lower' ? 'Lower is better' : 'Neutral'} active={f.direction === t} onPress={() => set('direction', t)} />)}</View>
      <View style={{ flexDirection: 'row', gap: 8 }}><Field label="Decimals (0-6)" value={f.decimals} onChangeText={(v) => set('decimals', v)} keyboardType="number-pad" /><Field label="Protocol" value={f.protocol} onChangeText={(v) => set('protocol', v)} /></View>
      <Field label="Description" value={f.description} onChangeText={(v) => set('description', v)} multiline />
      <Field label="Testing instructions" value={f.instructions} onChangeText={(v) => set('instructions', v)} multiline />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}><Switch value={f.active} onValueChange={(v) => set('active', v)} /><Body>Active for new testing</Body></View>
      {err ? <Body style={{ color: c.destructive, marginBottom: 8 }}>{err}</Body> : null}
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}><Btn label="Cancel" kind="ghost" onPress={() => setEdit(null)} /><Btn label="Save metric" loading={create.isPending || update.isPending} onPress={save} /></View>
    </Sheet>
    <Confirm visible={!!deact} title="Deactivate metric?" copy="It will no longer be available for new testing. Existing results and reports stay intact." confirmLabel="Deactivate" onCancel={() => setDeact(null)} onConfirm={() => deact && toggle(deact)} />
    <AuditSheet kind="metric" id={audit} title="Metric audit history" onClose={() => setAudit(null)} />
  </View>;
}
