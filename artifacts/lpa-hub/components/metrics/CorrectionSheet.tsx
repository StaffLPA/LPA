import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useCorrectPerformanceResult } from '@workspace/api-client-react';
import { Body, Btn, Field, Sheet } from './ui';
import { PerformanceResult, errMsg, useInvalidateMetrics } from '@/lib/metrics';

export function CorrectionSheet({ result, athleteName, metricName, showGoal, onClose }: { result: PerformanceResult | null; athleteName: string; metricName: string; showGoal?: boolean; onClose: () => void }) {
  const invalidate = useInvalidateMetrics();
  const m = useCorrectPerformanceResult();
  const [v, setV] = useState(''); const [date, setDate] = useState(''); const [reason, setReason] = useState('');
  const [notes, setNotes] = useState(''); const [pub, setPub] = useState(''); const [sets, setSets] = useState(''); const [reps, setReps] = useState('');
  const [goal, setGoal] = useState(''); const [err, setErr] = useState('');
  useEffect(() => {
    if (!result) return;
    setV(String(result.value)); setDate(result.testingDate.slice(0, 10)); setReason(''); setNotes(result.notes ?? ''); setPub(result.publicNotes ?? '');
    setSets(result.sets ? String(result.sets) : ''); setReps(result.repetitions ? String(result.repetitions) : '');
    setGoal(result.goal === null || result.goal === undefined ? '' : String(result.goal)); setErr('');
  }, [result?.id, result?.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!result) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  const save = () => {
    const value = Number(v);
    if (v.trim() === '' || !Number.isFinite(value) || value < 0) return setErr('Enter a valid value.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr('Use the date format YYYY-MM-DD.');
    if (!reason.trim()) return setErr('A reason for the correction is required.');
    const n = (x: string) => (x.trim() ? Number(x) : null);
    m.mutate({ id: result.id, data: { revision: result.revision, value, testingDate: date, reason: reason.trim(), notes, publicNotes: pub, sets: n(sets), repetitions: n(reps), ...(showGoal ? { goal: n(goal) } : {}) } as never }, {
      onSuccess: () => { void invalidate(); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  return <Sheet visible title={`Correct result`} onClose={onClose}>
    <Body muted>{athleteName} · {metricName} · revision {result.revision}. The original value stays in the audit history.</Body>
    <View style={{ height: 10 }} />
    <View style={{ flexDirection: 'row', gap: 8 }}><Field label={`Value (${result.unit})`} value={v} onChangeText={setV} keyboardType="decimal-pad" /><Field label="Testing date" value={date} onChangeText={setDate} autoCapitalize="none" /></View>
    <View style={{ flexDirection: 'row', gap: 8 }}><Field label="Sets" value={sets} onChangeText={setSets} keyboardType="number-pad" /><Field label="Repetitions" value={reps} onChangeText={setReps} keyboardType="number-pad" /></View>
    {showGoal ? <Field label="Goal (optional recorded target)" value={goal} onChangeText={setGoal} keyboardType="decimal-pad" /> : null}
    <Field label="Reason for correction (required)" value={reason} onChangeText={setReason} multiline />
    <Field label="Internal notes (staff only)" value={notes} onChangeText={setNotes} multiline />
    <Field label="Public notes (visible in reports)" value={pub} onChangeText={setPub} multiline />
    {err ? <Body style={{ color: '#E0625A', marginBottom: 8 }}>{err}</Body> : null}
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}><Btn label="Cancel" kind="ghost" onPress={onClose} /><Btn label="Save correction" loading={m.isPending} onPress={save} /></View>
  </Sheet>;
}
void Alert;
