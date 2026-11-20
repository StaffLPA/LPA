import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetBuildAssignmentsQueryKey,
  getGetBuildAthleteProgressQueryKey,
  useAssignBuildProgram,
  useGetBuildAssignments,
  useGetBuildAthleteProgress,
  useSetBuildAccessSettings,
  useSetBuildAthletePin,
} from '@workspace/api-client-react';
import type { BuildAssignmentAthlete } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { LpaIcon as Icon } from '@/components/LpaIcon';
import { Body, Btn, Card, Chip, Empty, ErrorBox, Field, Label, SearchBox, Sheet, Skeleton } from '@/components/metrics/ui';

type SortKey = 'name' | 'team' | 'program' | 'start' | 'last' | 'percent';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' }, { key: 'team', label: 'Team' }, { key: 'program', label: 'Program' },
  { key: 'start', label: 'Start' }, { key: 'last', label: 'Last workout' }, { key: 'percent', label: 'Completion' },
];

/** Phoenix does not observe DST, so UTC-7 is exact year-round. */
export const phoenixToday = () => new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export function AssignPrograms() {
  const c = useColors();
  const client = useQueryClient();
  const key = getGetBuildAssignmentsQueryKey();
  const q = useGetBuildAssignments({ query: { queryKey: key, refetchInterval: 10_000 } });
  const assign = useAssignBuildProgram();
  const setAccess = useSetBuildAccessSettings();
  const setPin = useSetBuildAthletePin();
  const [search, setSearch] = useState('');
  const [team, setTeam] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [desc, setDesc] = useState(false);
  const [target, setTarget] = useState<BuildAssignmentAthlete | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(phoenixToday());
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [progressFor, setProgressFor] = useState<BuildAssignmentAthlete | null>(null);
  const [pinFor, setPinFor] = useState<BuildAssignmentAthlete | null>(null);
  const [pinDraft, setPinDraft] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  };
  const refresh = () => client.invalidateQueries({ queryKey: key });

  const data = q.data;
  const groups = useMemo(() => {
    const set = new Set<string>();
    (data?.athletes ?? []).forEach((a) => { a.teams.forEach((t) => set.add(t)); if (a.group) set.add(a.group); });
    return [...set].sort();
  }, [data?.athletes]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (data?.athletes ?? [])
      .filter((a) => !term || a.displayName.toLowerCase().includes(term))
      .filter((a) => !team || a.teams.includes(team) || a.group === team);
    const val = (a: BuildAssignmentAthlete): string | number => {
      switch (sort) {
        case 'team': return [...a.teams, a.group ?? ''].join(' ').toLowerCase() || '~';
        case 'program': return a.assignment?.programName.toLowerCase() ?? '~';
        case 'start': return a.assignment?.startDate ?? '';
        case 'last': return a.lastWorkoutAt ?? '';
        case 'percent': return a.completionPercent ?? -1;
        default: return a.displayName.toLowerCase();
      }
    };
    const sorted = [...list].sort((x, y) => {
      const a = val(x); const b = val(y);
      const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      return r || x.displayName.localeCompare(y.displayName);
    });
    return desc ? sorted.reverse() : sorted;
  }, [data?.athletes, search, team, sort, desc]);

  const openAssign = (a: BuildAssignmentAthlete) => {
    setTarget(a); setProgramId(a.assignment?.programId ?? null); setStartDate(phoenixToday()); setNote(''); setFormError('');
  };
  const submit = async (unassign: boolean) => {
    if (!target) return;
    if (!unassign && !programId) { setFormError('Choose a program to assign.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { setFormError('Start date must look like YYYY-MM-DD.'); return; }
    try {
      await assign.mutateAsync({ athleteId: target.id, data: { programId: unassign ? null : programId, startDate, note: note.trim() } });
      const name = target.displayName;
      const prog = data?.programs.find((p) => p.id === programId)?.name;
      setTarget(null);
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: getGetBuildAthleteProgressQueryKey(target.id) })]);
      showToast(unassign ? `${name} is unassigned.` : `${prog ?? 'Program'} assigned to ${name}.`);
    } catch (e) { setFormError(errText(e)); }
  };
  const togglePin = async (value: boolean) => {
    try { await setAccess.mutateAsync({ data: { pinRequired: value } }); await refresh(); showToast(value ? 'PIN now required on /build.' : 'PIN no longer required.'); }
    catch (e) { showToast(errText(e)); }
  };
  const savePin = async (clear: boolean) => {
    if (!pinFor) return;
    if (!clear && !/^\d{4}$/.test(pinDraft)) { setFormError('PIN must be exactly 4 digits.'); return; }
    try {
      await setPin.mutateAsync({ athleteId: pinFor.id, data: clear ? {} : { pin: pinDraft } });
      const name = pinFor.displayName; setPinFor(null); await refresh();
      showToast(clear ? `PIN cleared for ${name}.` : `PIN set for ${name}.`);
    } catch (e) { setFormError(errText(e)); }
  };

  if (q.isLoading) return <View><Skeleton h={90} /><Skeleton h={60} /><Skeleton h={120} /><Skeleton h={120} /></View>;
  if (q.isError || !data) return <ErrorBox message={errText(q.error)} onRetry={() => void q.refetch()} />;

  return <View>
    <Card>
      <View style={st.rowTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[st.kicker, { color: c.accent }]}>ATHLETE ACCESS · /BUILD</Text>
          <Text style={[st.title, { color: c.foreground }]}>Require a 4-digit PIN</Text>
          <Body muted>When on, athletes must enter their PIN before their program opens on /build. Athletes without a PIN cannot open their program until you set one below. When off, anyone at the station can pick a name.</Body>
        </View>
        <Switch testID="build-pin-toggle" value={data.pinRequired} disabled={setAccess.isPending}
          onValueChange={(v) => void togglePin(v)} trackColor={{ true: c.primary, false: c.border }} />
      </View>
    </Card>

    <SearchBox value={search} onChange={setSearch} placeholder="Search athletes" testID="assign-search" />
    {groups.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
      <Chip label="All teams" active={!team} onPress={() => setTeam('')} testID="assign-team-all" />
      {groups.map((g) => <Chip key={g} label={g} active={team === g} onPress={() => setTeam(team === g ? '' : g)} testID={`assign-team-${g}`} />)}
    </ScrollView> : null}
    <View style={st.sortRow}>
      <Label>Sort</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        {SORTS.map((o) => <Chip key={o.key} testID={`assign-sort-${o.key}`} active={sort === o.key}
          label={sort === o.key ? `${o.label} ${desc ? '↓' : '↑'}` : o.label}
          onPress={() => { if (sort === o.key) setDesc((d) => !d); else { setSort(o.key); setDesc(false); } }} />)}
      </ScrollView>
    </View>
    <Text style={[st.count, { color: c.mutedForeground }]}>{rows.length} ACTIVE ATHLETE{rows.length === 1 ? '' : 'S'}</Text>

    {rows.length ? rows.map((a) => {
      const pct = a.completionPercent;
      return <View key={a.id} style={[st.row, { backgroundColor: c.card, borderColor: c.border, borderLeftColor: a.assignment ? c.primary : c.border }]}>
        <View style={st.rowTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[st.name, { color: c.foreground }]}>{a.displayName}</Text>
            <Text numberOfLines={1} style={[st.meta, { color: c.mutedForeground }]}>{[...a.teams, a.group].filter(Boolean).join(' · ') || 'No team'}</Text>
          </View>
          {a.hasPin ? <View style={[st.badge, { borderColor: c.border }]}><Icon name="lock" size={11} color={c.mutedForeground} /><Text style={[st.badgeText, { color: c.mutedForeground }]}>PIN</Text></View> : null}
        </View>
        <View style={st.grid}>
          <Stat label="Program" value={a.assignment?.programName ?? 'Unassigned'} strong={!!a.assignment} />
          <Stat label="Start" value={fmtDate(a.assignment?.startDate)} />
          <Stat label="Last workout" value={fmtDate(a.lastWorkoutAt)} />
          <Stat label="Complete" value={pct == null ? '—' : `${Math.round(pct)}%`} />
        </View>
        {pct != null ? <View style={[st.bar, { backgroundColor: c.muted }]}><View style={[st.barFill, { backgroundColor: c.primary, width: `${Math.max(0, Math.min(100, pct))}%` }]} /></View> : null}
        <View style={st.actions}>
          <Btn label={a.assignment ? 'Change program' : 'Assign program'} icon="edit-3" onPress={() => openAssign(a)} testID={`assign-open-${a.id}`} />
          <Btn label="Progress" kind="ghost" icon="award" onPress={() => setProgressFor(a)} testID={`assign-progress-${a.id}`} />
          <Btn label={a.hasPin ? 'Change PIN' : 'Set PIN'} kind="ghost" icon="lock" onPress={() => { setPinFor(a); setPinDraft(''); setFormError(''); }} testID={`assign-pin-${a.id}`} />
        </View>
      </View>;
    }) : <Empty title={search || team ? 'No athletes match' : 'No active athletes yet'} copy={search || team ? 'Clear the search or team filter.' : 'Active athletes appear here automatically.'} />}

    <Sheet visible={!!target} title={target ? `${target.assignment ? 'Change' : 'Assign'} · ${target.displayName}` : ''} onClose={() => setTarget(null)}>
      {target?.assignment ? <Body muted style={{ marginBottom: 10 }}>Currently on {target.assignment.programName} since {fmtDate(target.assignment.startDate)}. Reassigning keeps the past assignment in history.</Body> : null}
      <Label>Program</Label>
      {data.programs.length ? data.programs.map((p) => {
        const on = programId === p.id;
        return <Pressable key={p.id} testID={`assign-program-${p.id}`} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setProgramId(p.id)}
          style={[st.option, { borderColor: on ? c.primary : c.border, backgroundColor: on ? `${c.primary}1F` : c.background }]}>
          <Icon name={on ? 'check-circle' : 'circle'} size={16} color={on ? c.primary : c.mutedForeground} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[st.optName, { color: c.foreground }]}>{p.name}</Text>
            <Text style={[st.meta, { color: c.mutedForeground }]}>{p.weekCount} weeks · {p.dayCount} days · {p.exerciseCount} exercises</Text>
          </View>
        </Pressable>;
      }) : <Body muted>Build a program in Program Library first.</Body>}
      <View style={{ height: 8 }} />
      <Field label="Start date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} testID="assign-start" autoCapitalize="none" />
      <Field label="Note to athlete · optional" value={note} onChangeText={setNote} multiline maxLength={2000} testID="assign-note" placeholder="What to focus on this block" />
      {formError ? <Text accessibilityRole="alert" style={[st.err, { color: c.destructive }]}>{formError}</Text> : null}
      <View style={st.actions}>
        {target?.assignment ? <Btn label="Unassign" kind="danger" onPress={() => void submit(true)} disabled={assign.isPending} testID="assign-unassign" /> : null}
        <View style={{ flex: 1 }} />
        <Btn label="Cancel" kind="ghost" onPress={() => setTarget(null)} testID="assign-cancel" />
        <Btn label={target?.assignment ? 'Reassign' : 'Assign'} loading={assign.isPending} onPress={() => void submit(false)} testID="assign-save" />
      </View>
    </Sheet>

    <Sheet visible={!!pinFor} title={pinFor ? `PIN · ${pinFor.displayName}` : ''} onClose={() => setPinFor(null)}>
      <Body muted>Share this 4-digit PIN with the athlete privately. It is only checked when PIN is required.</Body>
      <View style={{ height: 10 }} />
      <Label>New PIN</Label>
      <TextInput testID="assign-pin-input" value={pinDraft} onChangeText={(v) => setPinDraft(v.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" placeholderTextColor={c.mutedForeground}
        style={[st.pin, { color: c.foreground, borderColor: c.border, backgroundColor: c.background }]} />
      {formError ? <Text accessibilityRole="alert" style={[st.err, { color: c.destructive }]}>{formError}</Text> : null}
      <View style={st.actions}>
        {pinFor?.hasPin ? <Btn label="Clear PIN" kind="danger" onPress={() => void savePin(true)} disabled={setPin.isPending} testID="assign-pin-clear" /> : null}
        <View style={{ flex: 1 }} />
        <Btn label="Save PIN" loading={setPin.isPending} onPress={() => void savePin(false)} testID="assign-pin-save" />
      </View>
    </Sheet>

    <Sheet visible={!!progressFor} title={progressFor ? `Progress · ${progressFor.displayName}` : ''} onClose={() => setProgressFor(null)}>
      {progressFor ? <ProgressView athleteId={progressFor.id} /> : null}
    </Sheet>

    {toast ? <View pointerEvents="none" style={[st.toast, { backgroundColor: c.foreground }]}>
      <Icon name="check" size={14} color={c.background} /><Text style={[st.toastText, { color: c.background }]}>{toast}</Text>
    </View> : null}
  </View>;
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const c = useColors();
  return <View style={st.stat}>
    <Text style={[st.statLabel, { color: c.mutedForeground }]}>{label.toUpperCase()}</Text>
    <Text numberOfLines={1} style={[st.statValue, { color: strong ? c.primary : c.foreground }]}>{value}</Text>
  </View>;
}

function ProgressView({ athleteId }: { athleteId: string }) {
  const c = useColors();
  const q = useGetBuildAthleteProgress(athleteId, { query: { enabled: !!athleteId, queryKey: getGetBuildAthleteProgressQueryKey(athleteId) } });
  if (q.isLoading) return <View><Skeleton h={60} /><Skeleton h={120} /></View>;
  if (q.isError || !q.data) return <ErrorBox message={errText(q.error)} onRetry={() => void q.refetch()} />;
  const { assignments, logs, records } = q.data;
  return <View>
    <Label>Personal records · Build logs</Label>
    {records.length ? records.map((r) => <View key={`${r.exerciseName}-${r.loggedAt}`} style={[st.line, { borderBottomColor: c.border }]}>
      <Text numberOfLines={1} style={[st.optName, { color: c.foreground, flex: 1 }]}>{r.exerciseName}</Text>
      <Text style={[st.optName, { color: c.primary }]}>{r.weight} lb{r.reps ? ` × ${r.reps}` : ''}</Text>
    </View>) : <Body muted>No records yet.</Body>}
    <View style={{ height: 14 }} />
    <Label>Assignment history</Label>
    {assignments.length ? assignments.map((a) => {
      const own = logs.filter((l) => l.assignmentId === a.id);
      const days = [...new Map(own.map((l) => [l.dayId, `${l.weekName} · ${l.dayName}`])).entries()];
      return <View key={a.id} style={[st.hist, { borderColor: c.border }]}>
        <View style={st.rowTop}>
          <Text numberOfLines={1} style={[st.optName, { color: c.foreground, flex: 1 }]}>{a.programName}</Text>
          <Text style={[st.badgeText, { color: a.status === 'active' ? c.primary : c.mutedForeground }]}>{a.status.toUpperCase()}</Text>
        </View>
        <Text style={[st.meta, { color: c.mutedForeground }]}>{fmtDate(a.startDate)}{a.endedAt ? ` – ${fmtDate(a.endedAt)}` : ''}</Text>
        {a.note ? <Body muted style={{ marginTop: 4 }}>{a.note}</Body> : null}
        {days.map(([dayId, label]) => {
          const dl = own.filter((l) => l.dayId === dayId);
          const names = [...new Set(dl.map((l) => l.exerciseName))];
          return <View key={dayId} style={{ marginTop: 8 }}>
            <Text style={[st.statLabel, { color: c.mutedForeground }]}>{label.toUpperCase()}</Text>
            {names.map((n) => {
              const sets = dl.filter((l) => l.exerciseName === n).sort((x, y) => x.setNumber - y.setNumber);
              return <Text key={n} style={[st.meta, { color: c.foreground }]}>{n}: {sets.map((x) => `${x.weight ?? '–'}×${x.reps ?? '–'}${x.completed ? '' : '*'}`).join(', ')}</Text>;
            })}
          </View>;
        })}
        {!days.length ? <Text style={[st.meta, { color: c.mutedForeground, marginTop: 6 }]}>No sets logged.</Text> : null}
      </View>;
    }) : <Body muted>No assignments yet.</Body>}
  </View>;
}

const st = StyleSheet.create({
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4, marginBottom: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 15, marginBottom: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, marginVertical: 8 },
  row: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 16, padding: 14, marginBottom: 10 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 8 },
  stat: { width: '50%', paddingRight: 8 },
  statLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  statValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 2 },
  bar: { height: 4, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 7 },
  optName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  err: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 },
  pin: { minHeight: 52, borderWidth: 1, borderRadius: 12, fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: 10, textAlign: 'center' },
  line: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  hist: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  toast: { position: 'absolute', left: 0, right: 0, bottom: 8, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, maxWidth: 480, marginHorizontal: 'auto' as never },
  toastText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flexShrink: 1 },
});
