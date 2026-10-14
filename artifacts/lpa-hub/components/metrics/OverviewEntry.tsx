import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/build/react-navigation/core';
import { useGetMetricsOverviewResults, useSaveMetricsOverviewResults } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { DateCalendarSheet } from './DateCalendarSheet';
import { Body, Btn, Card, Chip, Confirm, Empty, ErrorBox, Field, H, Skeleton } from './ui';
import { errMsg, fmtDate, fmtNum, phoenixToday, useBatchId, useInvalidateMetrics, useWorkspace } from '@/lib/metrics';
import { useQueryClient } from '@tanstack/react-query';
import type { PerformanceResult } from '@workspace/api-client-react';
import { Approvals, CATS, Drafts, MIN_DATE, Existing, approveEdit, buildEntries, cellState, changedKeys, draftKey, draftSignature, parseKey, recordable, removeSaved, summarize, validateCell, validateDate } from '@/lib/overviewDraft';

export type LeaveGuard = (run: () => void) => void;
const NAME_W = 150; const COL_W = 118;
const EMPTY_PARAMS = {};

export function OverviewEntry({ register, initialMetricId, initialAthleteId }: { register: (g: LeaveGuard | null) => void; initialMetricId?: string; initialAthleteId?: string }) {
  const c = useColors(); const navigation = useNavigation();
  const { user } = useApp();
  const q = useWorkspace(EMPTY_PARAMS, true);
  const ws = q.data;
  const rec = useSaveMetricsOverviewResults();
  const batch = useBatchId();
  const invalidate = useInvalidateMetrics();
  const qc = useQueryClient();
  const attempt = useRef<{ sig: string; entries: { athleteId: string; metricId: string; value: number; resultId?: string; revision?: number }[] } | null>(null);
  const [category, setCategory] = useState<string>('Speed');
  const [team, setTeam] = useState('');
  const [date, setDate] = useState(phoenixToday());
  const [drafts, setDrafts] = useState<Drafts>({});
  const [approvals, setApprovals] = useState<Approvals>({});
  const [editAsk, setEditAsk] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [leave, setLeave] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);
  const inFlight = useRef(false);

  const saving = rec.isPending;
  const savingRef = useRef(false); savingRef.current = saving || inFlight.current;
  const dirty = changedKeys(drafts, approvals).length > 0;
  const dirtyRef = useRef(false); dirtyRef.current = dirty;

  const dateErr = validateDate(date, phoenixToday());
  const eq = useGetMetricsOverviewResults({ testingDate: date }, { query: { enabled: !dateErr && !!user, queryKey: ['/api/metrics/overview', user?.id ?? 'anon', date], staleTime: 10_000, refetchInterval: 30_000 } });
  const existing = useMemo(() => {
    const o: Existing = {};
    for (const r of (eq.data ?? [])) {
      const k = draftKey(r.athleteId, r.metricId);
      if (!o[k]) o[k] = { id: r.id, revision: r.revision, value: r.value, unit: r.unit, dataType: r.dataType, decimals: r.decimals };
    }
    return o;
  }, [eq.data]);
  const loaded = !dateErr && eq.isSuccess && !!eq.data;
  const athletes = ws?.athletes ?? [];
  const teamDef = (ws?.teams ?? []).find((t) => t.id === team);
  const shownAthletes = useMemo(() => athletes.filter((a) => !team || a.teams.includes(team) || (!!teamDef && a.teams.includes(teamDef.label))), [athletes, team, teamDef]);
  const allMetrics = ws?.metrics ?? [];
  const initialMetricApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!initialMetricId || initialMetricApplied.current === initialMetricId) return;
    const metric = ws?.metrics.find((m) => m.id === initialMetricId);
    if (metric && CATS.some((t) => t.category === metric.category)) {
      setCategory(metric.category);
      initialMetricApplied.current = initialMetricId;
    }
  }, [initialMetricId, ws?.metrics]);
  const catMetrics = allMetrics.filter((m) => m.active && m.category === category);
  const entryMetrics = catMetrics.filter(recordable);
  const blocked = catMetrics.filter((m) => !recordable(m));
  const sum = summarize(drafts, approvals);
  const shownIds = new Set(shownAthletes.map((a) => a.id)); const colIds = new Set(entryMetrics.map((m) => m.id));
  const offscreen = changedKeys(drafts, approvals).filter((k) => { const [a, m] = parseKey(k); return !shownIds.has(a) || !colIds.has(m); }).length;

  useEffect(() => {
    if (typeof window === 'undefined' || !dirty || !user || typeof window.addEventListener !== 'function') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, user]);

  // Run an approved leave action once drafts are cleared.
  useEffect(() => {
    if (!dirty && !saving && pendingLeave.current) { const a = pendingLeave.current; pendingLeave.current = null; a(); }
  }, [dirty, saving]);

  const userId = user?.id ?? null;
  useEffect(() => { pendingLeave.current = null; setDrafts({}); setApprovals({}); attempt.current = null; batch.renew(); setEditAsk(null); setDiscard(false); setConfirm(false); setLeave(false); }, [userId]);

  const askLeave = useCallback((run: () => void) => {
    if (savingRef.current) { setErr('Saving in progress. Wait for it to finish before leaving.'); return; }
    if (!dirtyRef.current) { run(); return; }
    pendingLeave.current = null; setLeaveRun(() => run); setLeave(true);
  }, []);
  const [leaveRun, setLeaveRun] = useState<(() => void) | null>(null);
  useEffect(() => { register(askLeave); return () => register(null); }, [register, askLeave]);

  usePreventRemove(!!user && ['Admin', 'Staff-Coach'].includes(user.role) && (dirty || saving), ({ data: nav }) => {
    if (savingRef.current) { setErr('Saving in progress. Wait for it to finish before leaving.'); return; }
    setLeaveRun(() => () => navigation.dispatch(nav.action as never)); setLeave(true);
  });

  const approveLeave = () => {
    const run = leaveRun; setLeave(false); setLeaveRun(null);
    if (!run) return;
    pendingLeave.current = run; setDrafts({}); setApprovals({}); attempt.current = null; batch.renew();
  };

  const discardAll = () => { setDiscard(false); setDrafts({}); setApprovals({}); attempt.current = null; batch.renew(); setErr(''); setOk(''); };
  const approve = (k: string) => {
    const rec = existing[k]; const [, mid] = parseKey(k); const m = allMetrics.find((x) => x.id === mid);
    setEditAsk(null); if (!rec || !m) return;
    const r = approveEdit(drafts, approvals, k, rec, m); setDrafts(r.drafts); setApprovals(r.approvals);
  };
  useEffect(() => { setDrafts({}); setApprovals({}); setEditAsk(null); attempt.current = null; batch.renew(); }, [date]);
  const pickDate = (d: string) => {
    if (d === date) return;
    if (dirtyRef.current) { // let the calendar close first, then ask before discarding
      const ask = () => setNextDate(d);
      if (Platform.OS === 'web') ask(); else setTimeout(ask, 400);
      return;
    }
    setDate(d); setOk('');
  };
  const applyDate = () => {
    if (savingRef.current) return;
    const d = nextDate; setNextDate(null);
    if (d) { setDate(d); setOk(''); setErr(''); }
  };
  const setCell = (k: string, v: string) => { setOk(''); setDrafts((d) => ({ ...d, [k]: v })); };

  const openConfirm = () => {
    setErr(''); setOk('');
    if (dateErr) { setErr(dateErr); return; }
    if (!loaded) { setErr('Saved results for this date have not loaded. Retry loading before saving.'); return; }
    // A lost response can leave a committed result visible after polling.
    // Confirm an unchanged attempted payload before consulting new baselines,
    // so its idempotent retry is not mistaken for an unapproved edit.
    if (attempt.current?.sig === draftSignature(date, drafts, approvals)) {
      setConfirm(true); return;
    }
    const r = buildEntries(drafts, approvals, existing, athletes, allMetrics);
    if ('error' in r) { setErr(r.error); return; }
    setConfirm(true);
  };
  const submit = () => {
    setConfirm(false);
    if (inFlight.current || !loaded) return;
    const sig = draftSignature(date, drafts, approvals);
    let entries: NonNullable<typeof attempt.current>['entries'];
    if (attempt.current && attempt.current.sig === sig) {
      entries = attempt.current.entries; // idempotent retry: same payload, same batch id
    } else {
      if (attempt.current) { batch.renew(); attempt.current = null; } // payload changed after a failed request
      const r = buildEntries(drafts, approvals, existing, athletes, allMetrics);
      if ('error' in r) { setErr(r.error); return; }
      entries = r.entries; attempt.current = { sig, entries };
    }
    const savedKeys = entries.map((e) => draftKey(e.athleteId, e.metricId));
    inFlight.current = true;
    const testingDate = date;
    const cacheKey = ['/api/metrics/overview', user?.id ?? 'anon', testingDate];
    rec.mutate({ data: { sessionId: batch.get(), testingDate, entries } }, {
      onSuccess: (res) => {
        inFlight.current = false; attempt.current = null; batch.renew();
        const rows = res as PerformanceResult[];
        qc.setQueryData<PerformanceResult[]>(cacheKey, (old) => {
          const incoming = new Set(rows.map((x) => draftKey(x.athleteId, x.metricId)));
          return [...(old ?? []).filter((x) => !incoming.has(draftKey(x.athleteId, x.metricId))), ...rows];
        });
        setDrafts((d) => removeSaved(d, {}, savedKeys).drafts); setApprovals((a) => removeSaved({}, a, savedKeys).approvals); setErr('');
        void invalidate();
        setOk(`Saved ${rows.length} result${rows.length === 1 ? '' : 's'} for ${fmtDate(testingDate)}.`);
      },
      onError: (e) => { inFlight.current = false; setErr(`${errMsg(e)} Your entries are kept; retrying the same entries is safe.${sum.edits ? ' If a record was changed by someone else, discard the draft and approve the edit again.' : ''}`); },
    });
  };

  const hdr = { color: c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 11 } as const;
  return <View>
    <H sub="Record testing for the whole group at once. Saved results for the date show in the table; empty cells are new entries and only values you type or approve to edit are saved.">KPI Overview</H>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}><View style={{ flexDirection: 'row' }}>
      {CATS.map((t) => <Chip key={t.label} testID={`overview-category-${t.label.toLowerCase()}`} label={t.label} active={category === t.category} onPress={() => setCategory(t.category)} />)}
    </View></ScrollView>
    <Card>
      <Text style={[hdr, { letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }]}>Team</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={{ flexDirection: 'row' }}>
        <Chip testID="overview-team-all" label="All teams" active={!team} onPress={() => setTeam('')} />
        {(ws?.teams ?? []).map((t) => <Chip key={t.id} testID={`overview-team-${t.id}`} label={t.label} active={team === t.id} onPress={() => setTeam(t.id)} />)}
      </View></ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1, marginBottom: 10 }}>
          <Text style={[hdr, { letterSpacing: 1, marginBottom: 6 }]}>Date</Text>
          <Pressable testID="overview-date" accessibilityRole="button" accessibilityLabel={`Date, ${fmtDate(date)}. Opens calendar`} disabled={saving} onPress={() => setCalOpen(true)}
            style={{ minHeight: 42, borderWidth: 1, borderColor: c.border, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.background, opacity: saving ? 0.5 : 1 }}>
            <Text style={{ color: c.foreground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{fmtDate(date)}</Text>
            <Feather name="calendar" size={16} color={c.mutedForeground} />
          </Pressable>
        </View>
      </View>
      {dateErr ? <Body style={{ color: c.destructive }}>{dateErr}</Body> : null}
      {dirty ? <View style={{ marginTop: 4 }}><Body muted style={{ fontSize: 12 }}>Changing the date discards these unsaved changes after you confirm, so edits never move to another day.</Body><View style={{ height: 6 }} /><Btn testID="overview-discard" label="Discard draft" kind="ghost" onPress={() => setDiscard(true)} disabled={saving} /></View> : null}
    </Card>
    {blocked.length ? <Card><Body style={{ color: c.primary }}>Entry is blocked for: {blocked.map((m) => m.name).join(', ')}. Configure the equipment unit in the Metrics Library first.</Body></Card> : null}
    {dateErr ? <Empty title="Enter a valid testing date" copy="Saved results load once the date is valid." /> : (q.isLoading && !ws) || eq.isLoading ? <><Skeleton h={160} /></> : eq.isError ? <ErrorBox message={`Saved results for this date could not load. ${errMsg(eq.error)}`} onRetry={() => void eq.refetch()} /> : q.isError && !ws ? <ErrorBox message={(q.error as Error)?.message || 'Roster could not load.'} onRetry={() => void q.refetch()} /> :
      !shownAthletes.length ? <Empty title="No athletes" copy="No people with the Athlete tag match this team." /> :
      !entryMetrics.length ? <Empty title="No metrics to record" copy="No active, configured metrics in this category." /> :
      <Card style={{ padding: 8 }}>
        <Text style={{ color: c.mutedForeground, fontSize: 11, margin: 4 }}>Swipe sideways for more metrics. {shownAthletes.length} athlete{shownAthletes.length === 1 ? '' : 's'}, {entryMetrics.length} metric{entryMetrics.length === 1 ? '' : 's'}.</Text>
        <ScrollView horizontal testID="overview-table" showsHorizontalScrollIndicator persistentScrollbar><View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: c.border, paddingBottom: 6 }}>
            <Text accessibilityRole="header" style={[hdr, { width: NAME_W, paddingLeft: 4 }]}>Athlete's Name</Text>
            {entryMetrics.map((m) => <View key={m.id} style={{ width: COL_W, paddingRight: 8 }}><Text style={hdr}>{m.name}</Text><Text style={{ color: c.mutedForeground, fontSize: 10 }}>{m.unit}</Text></View>)}
          </View>
          {shownAthletes.map((a) => <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderColor: `${c.border}66`, backgroundColor: a.id === initialAthleteId ? c.muted : undefined }}>
            <Text style={{ width: NAME_W, paddingLeft: 4, paddingRight: 6, color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }} numberOfLines={2}>{a.fullName}</Text>
            {entryMetrics.map((m) => { const k = draftKey(a.id, m.id); const v = drafts[k] ?? ''; const st = cellState(k, existing, approvals, drafts); const ap = approvals[k];
              const ex = existing[k]; const unit = ap?.unit ?? ex?.unit ?? m.unit; const diff = (ap || ex) && unit !== m.unit;
              const bad = st === 'new' || st === 'editing' ? validateCell(v, ap ? { id: ap.metricId, name: m.name, dataType: ap.dataType, decimals: ap.decimals } : m) ?? (st === 'editing' && v.trim() === '' ? 'Required' : null) : null;
              return <View key={m.id} style={{ width: COL_W, paddingRight: 8 }}>
                {st === 'locked' || st === 'needs-approval' ? <Pressable testID={`overview-cell-${k}`} accessibilityRole="button" accessibilityLabel={`${a.fullName}, ${m.name}: recorded ${ex.value} ${unit}. Tap to edit`} disabled={saving} onPress={() => setEditAsk(k)}
                    style={{ minHeight: 40, borderWidth: 1, borderColor: st === 'needs-approval' ? c.primary : c.border, borderRadius: 10, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: c.muted }}>
                    <Text style={{ color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{fmtNum(ex.value)}</Text></Pressable>
                  : <TextInput testID={`overview-cell-${k}`} accessibilityLabel={`${a.fullName}, ${m.name} in ${unit}`} value={v} editable={!saving} onChangeText={(t) => setCell(k, t)} keyboardType="decimal-pad" placeholder="-" placeholderTextColor={c.mutedForeground}
                    style={{ minHeight: 40, borderWidth: 1, borderColor: bad ? c.destructive : ap ? c.primary : c.border, borderRadius: 10, paddingHorizontal: 10, color: c.foreground, backgroundColor: c.background }} />}
                {st === 'needs-approval' ? <Text style={{ color: c.primary, fontSize: 9 }}>Saved result exists. Typed {v}; tap to review.</Text> : null}
                {st === 'locked' ? <Text style={{ color: c.mutedForeground, fontSize: 9 }}>Recorded{diff ? ` in ${unit}` : ''}</Text> : null}
                {st === 'editing' ? <Text style={{ color: c.mutedForeground, fontSize: 9 }}>Editing, was {fmtNum(ap.value)}{diff ? ` ${unit} (stored unit; catalog is ${m.unit})` : ''}</Text> : null}
                {bad ? <Text style={{ color: c.destructive, fontSize: 9 }}>{bad === 'Required' ? 'Required' : 'Invalid'}</Text> : null}
              </View>; })}
          </View>)}
        </View></ScrollView>
      </Card>}
    <Card>
      <Body>{sum.cells ? `Pending: ${sum.cells} result${sum.cells === 1 ? '' : 's'}${sum.edits ? ` (${sum.edits} edit${sum.edits === 1 ? '' : 's'})` : ''} across ${sum.athletes} athlete${sum.athletes === 1 ? '' : 's'} and ${sum.metrics} metric${sum.metrics === 1 ? '' : 's'}.` : 'No results entered yet.'}</Body>
      {offscreen ? <Body style={{ color: c.primary }}>{offscreen} drafted value{offscreen === 1 ? ' is' : 's are'} not visible in this team or category and will also be saved.</Body> : null}
    </Card>
    {err ? <Body style={{ color: c.destructive, marginBottom: 8 }}>{err}</Body> : null}
    {ok ? <Body style={{ color: c.accent, marginBottom: 8 }}>{ok}</Body> : null}
    <Btn testID="overview-save" label="Save" icon="check" loading={saving} disabled={!dirty || saving || !loaded} onPress={openConfirm} />
    <Confirm visible={confirm} title="Save metrics" copy={`You are about to save the metrics recorded on ${fmtDate(date)}. Do you want to proceed?${sum.edits ? ` This includes ${sum.edits} edit${sum.edits === 1 ? '' : 's'} to existing recorded results.` : ''}`} confirmLabel="Proceed" onCancel={() => setConfirm(false)} onConfirm={submit} />
    <Confirm visible={!!editAsk} title="Edit recorded result?" copy={editAsk ? `${athletes.find((a) => a.id === parseKey(editAsk)[0])?.fullName ?? 'This athlete'} already has a ${allMetrics.find((m) => m.id === parseKey(editAsk)[1])?.name ?? 'metric'} result on ${fmtDate(date)}. Do you want to edit it? Nothing is saved until you press Save.` : ''} confirmLabel="Edit" onCancel={() => setEditAsk(null)} onConfirm={() => editAsk && approve(editAsk)} />
    <Confirm visible={discard} title="Discard draft?" copy="All unsaved entries and edit approvals will be cleared." confirmLabel="Discard" onCancel={() => setDiscard(false)} onConfirm={discardAll} />
    <DateCalendarSheet visible={calOpen} title="Select date" value={date} minDate={MIN_DATE} testIDPrefix="overview-date-cal" onSelect={pickDate} onClose={() => setCalOpen(false)} />
    <Confirm visible={!!nextDate} title="Change date?" copy={`Changing the date to ${nextDate ? fmtDate(nextDate) : ''} will discard your unsaved entries and edit approvals. Do you want to proceed?`} confirmLabel="Discard and change" onCancel={() => setNextDate(null)} onConfirm={applyDate} />
    <Confirm visible={leave} title="Leave KPI Overview?" copy="You have unsaved results. Leaving will discard them." confirmLabel="Leave" onCancel={() => { setLeave(false); setLeaveRun(null); }} onConfirm={approveLeave} />
  </View>;
}
