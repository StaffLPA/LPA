import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/build/react-navigation/core';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useExportDailyRollcall, useExportRollcallWorkbook, useGetDailyRollcall, useRetryRollcallWorkbook, useSaveDailyRollcall } from '@workspace/api-client-react';
import type { DailyRollcall } from '@workspace/api-client-react';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { ROLLCALL_LABELS, deliverRollcallExport, formatLongDate, isRollcallCategory, phoenixToday, shiftDate, validateRollcallDate, MIN_DATE } from '@/lib/rollcall';

type Status = 'present' | 'absent' | 'tardy' | 'pending';
type Draft = { baseRevision: number; statuses: Record<string, Status>; previous: Record<string, Status> };
type Confirm = { title: string; body: string; confirmLabel: string; onConfirm: () => void; saveBeforeLeave?: boolean };
const savedTime = (value: string) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: 'numeric', minute: '2-digit', second: '2-digit',
}).format(new Date(value)) + ' MST';

function errorInfo(error: unknown): { status?: number; message: string } {
  const e = error as { status?: number; data?: { message?: string; error?: string } | null; message?: string } | null;
  const message = e?.data?.message ?? e?.data?.error ?? e?.message ?? 'Something went wrong.';
  return { status: e?.status, message };
}

export function RollcallAttendance({ rawCategory }: { rawCategory?: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { role, user } = useApp();
  const authorized = role === 'Admin' || role === 'Staff-Coach';
  const validCategory = isRollcallCategory(rawCategory);
  const category = validCategory ? rawCategory : 'coach';
  const manualSubmit = category === 'bus';
  const canMarkTardy = category === 'coach' || category === 'academics';
  const autoRetryAt = useRef(0);

  const [today, setToday] = useState(phoenixToday);
  const [date, setDate] = useState(today);
  const [dateInput, setDateInput] = useState(today);
  const [dateError, setDateError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const viewerRef = useRef({ id: user?.id, authorized });
  viewerRef.current = { id: user?.id, authorized };
  const mountedRef = useRef(true);
  const saveInFlight = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const ownsResponse = (id: string | undefined) =>
    mountedRef.current && viewerRef.current.authorized && viewerRef.current.id === id;

  const key = `${category}:${date}`;
  const draft = drafts[key];
  const enabled = authorized && validCategory;

  const query = useGetDailyRollcall(category, date, {
    query: {
      enabled,
      queryKey: [`/api/rollcall/${category}/${date}`],
      refetchInterval: 1_500,
      refetchOnWindowFocus: true,
    },
  });
  const saveMutation = useSaveDailyRollcall();
  const exportMutation = useExportDailyRollcall();
  const workbookExport = useExportRollcallWorkbook();
  const retryWorkbook = useRetryRollcallWorkbook();
  const data = query.data as DailyRollcall | undefined;
  const canEdit = authorized && (date === today || role === 'Admin') && data?.canEdit !== false;
  const pendingLeave = useRef<(() => void) | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const effective = useCallback((id: string, serverStatus: Status): Status => draft?.statuses[id] ?? serverStatus, [draft]);
  const dirty = useMemo(() => {
    if (!draft || !data) return false;
    return Object.entries(draft.statuses).some(([id, status]) => data.students.find((s) => s.id === id)?.status !== status);
  }, [draft, data]);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (Platform.OS !== 'web' || !authorized || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [authorized, dirty]);

  // Roll the default date forward at midnight Phoenix without moving a chosen historical date.
  useEffect(() => {
    const check = () => {
      const now = phoenixToday();
      setToday((prev) => {
        if (prev !== now) {
          setDate((d) => (d === prev && !dirtyRef.current && !savingRef.current ? now : d));
          setDateInput((d) => (d === prev && !dirtyRef.current && !savingRef.current ? now : d));
        }
        return now;
      });
    };
    const timer = setInterval(check, 1_000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);

  // Drop drafts and dialogs when the signed-in identity changes or access is lost.
  const userId = user?.id ?? null;
  useEffect(() => { pendingLeave.current = null; setDrafts({}); setConfirm(null); setConflict(false); setNotice(null); }, [userId, authorized]);

  const saving = saveMutation.isPending;
  const savingRef = useRef(false);
  savingRef.current = saving || saveInFlight.current;
  useEffect(() => {
    if (!dirty && !saving && pendingLeave.current) {
      const action = pendingLeave.current;
      pendingLeave.current = null;
      action();
    }
  }, [dirty, saving, drafts, confirm]);

  usePreventRemove(authorized && (dirty || saving), ({ data: nav }) => {
    if (savingRef.current) { setNotice({ kind: 'error', text: 'Saving in progress. Wait for it to finish before leaving.' }); return; }
    setConfirm({
      title: 'Unsaved Changes',
      body: 'Save the current attendance before leaving, or leave without saving and discard these changes.',
      confirmLabel: 'Leave Without Saving',
      saveBeforeLeave: true,
      onConfirm: () => {
        setDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
        pendingLeave.current = () => navigation.dispatch(nav.action as never);
      },
    });
  });

  const guard = (title: string, run: () => void) => {
    if (savingRef.current) return;
    if (!dirty) { run(); return; }
    setConfirm({
      title,
      body: 'Save the current attendance before switching, or leave without saving and discard these changes.',
      confirmLabel: 'Leave Without Saving',
      saveBeforeLeave: true,
      onConfirm: () => {
        setDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
        setConflict(false);
        pendingLeave.current = run;
      },
    });
  };

  const goToDate = (next: string) => {
    guard('Change date?', () => {
      setDate(next); setDateInput(next); setDateError(null); setNotice(null); setConflict(false); setSearch('');
    });
  };
  const applyDate = () => {
    if (savingRef.current) return;
    const problem = validateRollcallDate(dateInput, today);
    if (problem) { setDateError(problem); return; }
    setDateError(null);
    const next = dateInput.trim();
    if (next !== date) goToDate(next);
  };

  const setStatus = (id: string, serverStatus: Status, current: Status, next: Status) => {
     if (!data || savingRef.current || !canEdit) return;
    const target: Status = current === next ? 'pending' : next;
    setNotice(null);
    setDrafts((all) => {
      const base = all[key] ?? { baseRevision: data.revision, statuses: {}, previous: {} };
      const statuses = { ...base.statuses };
      const previous = { ...base.previous, [id]: base.previous[id] ?? serverStatus };
      if (target === serverStatus) delete statuses[id]; else statuses[id] = target;
      if (!Object.keys(statuses).length) { const rest = { ...all }; delete rest[key]; return rest; }
      return { ...all, [key]: { ...base, statuses, previous } };
    });
  };

  const save = async (): Promise<boolean> => {
    if (!data || savingRef.current || !canEdit || !(dirty || (!data.updatedAt && data.students.length > 0))) return false;
    const selectedAt = new Date().toISOString();
    const savedKey = key;
    const savedCategory = category;
    const savedDate = date;
    const savingUserId = user?.id;
    setNotice(null);
    saveInFlight.current = true;
    savingRef.current = true;
    try {
      await queryClient.cancelQueries({ queryKey: [`/api/rollcall/${savedCategory}/${savedDate}`] });
      const saved = await saveMutation.mutateAsync(
      { category, date, data: { revision: draft?.baseRevision ?? data.revision, selectedAt, merge: true,
        entries: draft ? Object.entries(draft.statuses).map(([studentId, status]) => ({ studentId, status, previousStatus: draft.previous[studentId] })) : [] } });
          if (!ownsResponse(savingUserId)) return false;
          queryClient.setQueryData([`/api/rollcall/${savedCategory}/${savedDate}`], saved);
          setDrafts((all) => { const next = { ...all }; delete next[savedKey]; return next; });
           if (manualSubmit && savedDate === today) { setGroup('All'); setSearch(''); }
          setConflict(false);
          autoRetryAt.current = 0;
           setNotice({ kind: 'ok', text: `${manualSubmit ? 'Bus roll call submitted successfully' : 'Attendance automatically saved'}${saved.updatedAt ? ` at ${savedTime(saved.updatedAt)}` : ''}.${manualSubmit && savedDate === today ? ' Attendance recorded for Excel. All students reset to Pending/NA for the next Bus rollcall.' : ''}` });
          return true;
    } catch (error) {
          if (!ownsResponse(savingUserId)) return false;
          const info = errorInfo(error);
          autoRetryAt.current = Date.now() + 5_000;
          if (info.status === 409 || (info.status === 400 && /roster changed/i.test(info.message))) {
            setConflict(true);
            setNotice({ kind: 'error', text: info.message || 'Another staff member saved this date first.' });
          } else setNotice({ kind: 'error', text: `Save failed: ${info.message}` });
          return false;
    } finally { saveInFlight.current = false; savingRef.current = false; }
  };
  useEffect(() => {
    if (manualSubmit || !dirty || !canEdit || conflict || saving) return;
    const timer = setTimeout(() => { void save(); }, Math.max(650, autoRetryAt.current - Date.now()));
    return () => clearTimeout(timer);
  }, [manualSubmit, dirty, canEdit, conflict, saving, draft, key]);
  // If another device saved precisely the same edits, there is nothing left to submit.
  useEffect(() => {
    if (draft && data && !dirty && !saving) setDrafts((all) => { const next = { ...all }; delete next[key]; return next; });
  }, [draft, data, dirty, saving, key]);

  const reloadSaved = () => setConfirm({
    title: 'Reload saved attendance?',
    body: 'Your unsaved edits will be discarded and replaced with the latest saved data.',
    confirmLabel: 'Discard and reload',
    onConfirm: () => {
      setDrafts((all) => { const next = { ...all }; delete next[key]; return next; });
      setConflict(false); setNotice(null);
      void query.refetch();
    },
  });

  const exportFile = async () => {
    const exportingUserId = user?.id;
    setNotice(null);
    try {
      const file = await exportMutation.mutateAsync({ category, date });
      if (!ownsResponse(exportingUserId)) return;
      await deliverRollcallExport(file);
      if (ownsResponse(exportingUserId)) setNotice({ kind: 'ok', text: 'Export ready.' });
    } catch (error) {
      if (ownsResponse(exportingUserId)) setNotice({ kind: 'error', text: `Export failed: ${errorInfo(error).message}` });
    }
  };
  const downloadDailyWorkbook = async () => {
    const viewer = user?.id;
    try {
      const file = await workbookExport.mutateAsync();
      if (ownsResponse(viewer)) await deliverRollcallExport(file);
    } catch (error) { if (ownsResponse(viewer)) setNotice({ kind: 'error', text: `Workbook download failed: ${errorInfo(error).message}` }); }
  };
  const retryDailyWorkbook = async () => {
    const viewer = user?.id;
    try {
      await retryWorkbook.mutateAsync();
      if (ownsResponse(viewer)) { setNotice({ kind: 'ok', text: 'Daily Excel workbook updated.' }); void query.refetch(); }
    } catch (error) { if (ownsResponse(viewer)) setNotice({ kind: 'error', text: `Excel retry failed: ${errorInfo(error).message}. Attendance is safely retained.` }); }
  };

  const students = data?.students ?? [];
  const groupStudents = useMemo(() => students.filter((s) => group === 'All' || s.teams.includes(group)), [students, group]);
  const totals = useMemo(() => {
    let present = 0; let tardy = 0; let absent = 0;
    for (const s of groupStudents) {
      const v = draft?.statuses[s.id] ?? s.status;
      if (v === 'present') present += 1;
      else if (v === 'tardy') tardy += 1;
      else if (v === 'absent') absent += 1;
    }
    return { total: groupStudents.length, present, tardy, absent, pending: groupStudents.length - present - tardy - absent };
  }, [groupStudents, draft]);
  const needle = search.trim().toLowerCase();
  const visible = useMemo(() => groupStudents.filter((s) => !needle || s.fullName.toLowerCase().includes(needle)), [groupStudents, needle]);

  const header = <View style={styles.headerRow}>
    <Pressable testID="rollcall-back" accessibilityRole="button" accessibilityLabel="Go back" disabled={saving} onPress={() => (router.canGoBack() ? router.back() : router.replace('/daily-rollcall'))} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name="arrow-left" size={18} color={colors.foreground} />
    </Pressable>
    <View style={{ flex: 1 }}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>DAILY ROLLCALL</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>{validCategory ? ROLLCALL_LABELS[category] : 'Rollcall'}</Text>
    </View>
  </View>;

  const shell = (children: React.ReactNode) => <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 60 }]}>{header}{children}</ScrollView>
  </View>;

  if (!authorized) return shell(<Text testID="rollcall-denied" style={[styles.copy, { color: colors.mutedForeground }]}>Daily Rollcall is available to Admin and Staff-Coach accounts only.</Text>);
  if (!validCategory) return shell(<Text style={[styles.copy, { color: colors.mutedForeground }]}>Unknown rollcall category. Choose Coach, Bus, or Academics.</Text>);

  const statusColor = { present: colors.accent, tardy: colors.warning, absent: colors.destructive, pending: colors.mutedForeground } as const;
  const stat = (label: string, value: number, color: string) => <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Text style={[styles.statValue, { color }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
  </View>;
  const exportBlocked = dirty || saving;
   const canSave = canEdit && (dirty || (!data?.updatedAt && students.length > 0));
   const snapshot = data?.snapshots?.find((item) => item.id === historyId);

  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 60 }]}>
      {header}
        {query.isError ? <Text testID="rollcall-live-status" style={[styles.hint, { color: colors.warning, marginBottom: 10 }]}>Sync interrupted · unsaved edits are retained; reconnect to retry</Text> : null}
       <View style={[styles.actionRow, { marginBottom: 14 }]}>
         {(['coach', 'bus', 'academics'] as const).map((option) => <Pressable key={option} testID={`rollcall-switch-${option}`} disabled={saving} onPress={() => { if (option !== category) guard('Switch roll call?', () => router.replace(`/daily-rollcall/${option}`)); }} style={[styles.modalButton, { borderColor: option === category ? colors.primary : colors.border }]}><Text style={[styles.modalButtonText, { color: option === category ? colors.primary : colors.foreground }]}>{ROLLCALL_LABELS[option]}</Text></Pressable>)}
       </View>
      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>DATE</Text>
        <Text testID="rollcall-date-long" style={[styles.dateLong, { color: colors.foreground }]}>{formatLongDate(date)}</Text>
          {date !== today ? <Text style={[styles.hint, { color: colors.warning }]}>{canEdit ? 'Historical date · Admin corrections allowed' : 'Historical attendance is locked · Admin access required to edit'}</Text> : null}
        <View style={styles.dateRow}>
          <Pressable testID="rollcall-prev-day" accessibilityRole="button" accessibilityLabel="Previous day" disabled={date <= MIN_DATE || saving} onPress={() => goToDate(shiftDate(date, -1))} style={[styles.iconButton, { borderColor: colors.border, opacity: date <= MIN_DATE ? 0.4 : 1 }]}><Feather name="chevron-left" size={18} color={colors.foreground} /></Pressable>
          <TextInput testID="rollcall-date-input" value={dateInput} onChangeText={(t) => { setDateInput(t); setDateError(null); }} onSubmitEditing={applyDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel="Rollcall date" style={[styles.dateInput, { color: colors.foreground, borderColor: dateError ? colors.destructive : colors.border }]} />
          <Pressable testID="rollcall-apply-date" accessibilityRole="button" disabled={saving} onPress={applyDate} style={[styles.applyButton, { backgroundColor: colors.primary }]}><Text style={styles.applyText}>Apply</Text></Pressable>
          <Pressable testID="rollcall-next-day" accessibilityRole="button" accessibilityLabel="Next day" disabled={date >= today || saving} onPress={() => goToDate(shiftDate(date, 1))} style={[styles.iconButton, { borderColor: colors.border, opacity: date >= today ? 0.4 : 1 }]}><Feather name="chevron-right" size={18} color={colors.foreground} /></Pressable>
        </View>
        {dateError ? <Text testID="rollcall-date-error" style={[styles.errorText, { color: colors.destructive }]}>{dateError}</Text> : null}
        {date !== today ? <Pressable testID="rollcall-today" accessibilityRole="button" onPress={() => goToDate(today)} style={styles.todayLink}><Text style={[styles.linkText, { color: colors.primary }]}>Jump to today</Text></Pressable> : null}
      </View>

      {query.isLoading ? <View style={{ gap: 10 }} testID="rollcall-loading">{[0, 1, 2, 3].map((i) => <View key={i} style={[styles.skeleton, { backgroundColor: colors.secondary }]} />)}</View>
        : query.isError && !data ? <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowName, { color: colors.foreground }]}>Rollcall could not load</Text>
          <Text style={[styles.copy, { color: colors.mutedForeground, marginTop: 4 }]}>{errorInfo(query.error).message}</Text>
          <Pressable testID="rollcall-retry" accessibilityRole="button" onPress={() => void query.refetch()} style={[styles.bigButton, { backgroundColor: colors.primary, marginTop: 12 }]}><Feather name="refresh-cw" size={16} color="#fff" /><Text style={styles.applyText}>Retry</Text></Pressable>
        </View>
        : data ? <>
          <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 8 }]}>GROUP</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {['All', 'Group 1', 'Group 2', 'Group 3'].map((option) => <Pressable key={option}
              testID={`rollcall-group-${option === 'All' ? 'all' : option.slice(-1)}`}
              accessibilityRole="button" accessibilityLabel={`Filter ${option}`} accessibilityState={{ selected: group === option }}
              onPress={() => setGroup(option)}
              style={[styles.applyButton, { backgroundColor: group === option ? colors.primary : colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[styles.applyText, { color: group === option ? '#fff' : colors.foreground }]}>{option}</Text>
            </Pressable>)}
          </View>
          <Text testID="rollcall-group-count" style={[styles.hint, { color: colors.mutedForeground, marginBottom: 10 }]}>{group} · {groupStudents.length} students{group !== 'All' ? ` · ${students.length} across all groups` : ''}</Text>
          <View style={styles.statRow}>{stat('Total', totals.total, colors.foreground)}{stat('Present', totals.present, statusColor.present)}{canMarkTardy ? stat('Tardy', totals.tardy, statusColor.tardy) : null}{stat('Absent', totals.absent, statusColor.absent)}{stat('Pending', totals.pending, statusColor.pending)}</View>

          {notice ? <View testID="rollcall-notice" accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: notice.kind === 'ok' ? `${colors.accent}22` : `${colors.destructive}18`, borderColor: notice.kind === 'ok' ? colors.accent : colors.destructive }]}>
            <Text style={[styles.noticeText, { color: colors.foreground }]}>{notice.text}</Text>
            {conflict ? <Pressable testID="rollcall-reload-saved" accessibilityRole="button" onPress={reloadSaved} style={[styles.noticeAction, { borderColor: colors.destructive }]}><Text style={[styles.linkText, { color: colors.destructive }]}>Reload saved attendance</Text></Pressable> : null}
          </View> : null}
          {query.isError ? <Text style={[styles.errorText, { color: colors.destructive }]}>Could not refresh. Showing the last loaded data.</Text> : null}

          <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput testID="rollcall-search" value={search} onChangeText={setSearch} placeholder="Search student name" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Search student name" style={[styles.searchInput, { color: colors.foreground }]} />
          </View>

          <View style={styles.actionRow}>
            {manualSubmit ? <Pressable testID="rollcall-save" accessibilityRole="button" disabled={!canSave || saving} onPress={() => void save()} style={[styles.bigButton, { flex: 1, backgroundColor: colors.primary, opacity: !canSave || saving ? 0.45 : 1 }]}>
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Feather name="check" size={16} color="#fff" />}<Text style={styles.applyText}>{saving ? 'Submitting…' : 'Submit'}</Text>
            </Pressable> : <Text testID="rollcall-auto-save" style={[styles.hint, { flex: 1, color: colors.mutedForeground }]}>{saving ? 'Auto-saving…' : 'Changes save automatically'}</Text>}
            <Pressable testID="rollcall-export" accessibilityRole="button" accessibilityState={{ disabled: exportBlocked || exportMutation.isPending }} disabled={exportBlocked || exportMutation.isPending} onPress={() => void exportFile()} style={[styles.bigButton, { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: exportBlocked ? 0.5 : 1 }]}>
              {exportMutation.isPending ? <ActivityIndicator color={colors.primary} /> : <Feather name="download" size={16} color={colors.primary} />}<Text style={[styles.applyText, { color: colors.primary }]}>Export Excel</Text>
            </Pressable>
          </View>
          {manualSubmit && date === today ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>Submit records this trip for Excel and resets all students to Pending/NA for the next Bus rollcall.</Text> : null}
          {exportBlocked ? <Text testID="rollcall-export-hint" style={[styles.hint, { color: colors.mutedForeground }]}>{manualSubmit ? 'Submit first.' : 'Waiting for auto-save.'} The Excel file contains saved attendance only.</Text> : null}
          <Text testID="rollcall-save-status" accessibilityLiveRegion="polite" style={[styles.hint, { color: dirty ? colors.warning : data.updatedAt ? colors.success : colors.mutedForeground, fontWeight: '700' }]}>{saving ? 'Saving…' : dirty ? 'Unsaved Changes' : data.updatedAt ? manualSubmit && date === today ? 'Ready for next Bus rollcall' : 'Saved' : 'Not yet saved'}</Text>
          {data.updatedAt ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>Last saved {savedTime(data.updatedAt)}</Text> : null}
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Excel includes Coach, Bus, and Academics history through {date}. Bus saves appear in separate timestamped columns.</Text>
          {data.automation ? <View testID="rollcall-automation" style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 }]}>
            <Text style={[styles.rowName, { color: colors.foreground }]}>Daily Excel record</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: data.automation.workbookError ? colors.warning : colors.mutedForeground }]}>{data.automation.workbookError ?? (data.automation.workbookPending ? 'Workbook update queued · saved attendance is safe' : `Workbook updated${data.automation.workbookUpdatedAt ? ` ${savedTime(data.automation.workbookUpdatedAt)}` : ''}`)}</Text>
            {data.automation.finalizedAt ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>Day finalized {savedTime(data.automation.finalizedAt)} · historical attendance preserved</Text> : null}
            <View style={styles.actionRow}>
              <Pressable testID="rollcall-daily-workbook" disabled={workbookExport.isPending || data.automation.workbookPending || !data.automation.workbookUpdatedAt} onPress={() => void downloadDailyWorkbook()} style={[styles.modalButton, { borderColor: colors.border, opacity: data.automation.workbookPending ? 0.5 : 1 }]}><Text style={[styles.modalButtonText, { color: colors.foreground }]}>{workbookExport.isPending ? 'Downloading…' : 'Download daily workbook'}</Text></Pressable>
              {role === 'Admin' && data.automation.workbookError ? <Pressable testID="rollcall-workbook-retry" disabled={retryWorkbook.isPending} onPress={() => void retryDailyWorkbook()} style={[styles.modalButton, { borderColor: colors.primary }]}><Text style={[styles.modalButtonText, { color: colors.primary }]}>{retryWorkbook.isPending ? 'Retrying…' : 'Retry Excel update'}</Text></Pressable> : null}
            </View>
          </View> : null}
          {category === 'bus' ? <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 }]}>
            <Text style={[styles.rowName, { color: colors.foreground }]}>Attendance history</Text>
            {data.snapshots?.length ? [...data.snapshots].reverse().map((item) => <Pressable key={item.id} testID={`rollcall-snapshot-${item.revision}`} onPress={() => setHistoryId(historyId === item.id ? null : item.id)} style={{ paddingVertical: 10 }}><Text style={[styles.linkText, { color: colors.primary }]}>{savedTime(item.savedAt)} · Submission {item.revision}</Text><Text style={[styles.hint, { color: colors.mutedForeground }]}>Saved by {item.savedBy} · {item.students.filter((s) => s.status === 'present').length} present · {item.students.filter((s) => s.status === 'absent').length} absent</Text></Pressable>) : <Text style={[styles.hint, { color: colors.mutedForeground }]}>{data.updatedAt ? 'A previous saved record is preserved. New changed submissions will appear here separately.' : 'Tap Submit to record the first attendance snapshot.'}</Text>}
            {snapshot ? <View testID="rollcall-snapshot-detail"><Text style={[styles.hint, { color: colors.mutedForeground }]}>Read-only snapshot · {savedTime(snapshot.savedAt)}</Text>{snapshot.students.map((s) => <Text key={s.id} style={[styles.copy, { color: colors.foreground, marginTop: 5 }]}>{s.fullName}: {s.status === 'pending' ? 'Pending/NA' : s.status === 'present' ? 'Present (Yes)' : s.status === 'tardy' ? 'Tardy' : 'Absent (No)'}</Text>)}</View> : null}
          </View> : null}

          {students.length === 0 ? <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]} testID="rollcall-empty">
            <Text style={[styles.rowName, { color: colors.foreground }]}>No athletes on the roster</Text>
            <Text style={[styles.copy, { color: colors.mutedForeground, marginTop: 4 }]}>The temporary enrollment roster is used while students register. Previously saved dates retain their original roster.</Text>
          </View> : visible.length === 0 ? <Text style={[styles.copy, { color: colors.mutedForeground, textAlign: 'center', marginTop: 20 }]}>No students match this group and search.</Text>
            : <View style={{ gap: 9, marginTop: 14 }}>
              {visible.map((s) => {
                const current = effective(s.id, s.status);
                const changed = current !== s.status;
                return <View key={s.id} testID={`rollcall-row-${s.id}`} style={[styles.row, { backgroundColor: colors.card, borderColor: changed ? colors.primary : colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: colors.foreground }]}>{s.fullName}</Text>
                    <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{[s.gradYear, s.teams.join(', ')].filter(Boolean).join(' · ') || 'No grad year or team'}</Text>
                    <Text style={[styles.rowState, { color: statusColor[current] }]}>{current.toUpperCase()}{changed ? ' · UNSAVED' : ''}</Text>
                  </View>
                  <Pressable testID={`rollcall-present-${s.id}`} accessibilityRole="button" accessibilityLabel={`${s.fullName} present`} accessibilityState={{ selected: current === 'present', disabled: saving || !canEdit }} disabled={saving || !canEdit} onPress={() => setStatus(s.id, s.status, current, 'present')} style={[styles.toggle, { borderColor: statusColor.present, backgroundColor: current === 'present' ? statusColor.present : 'transparent', opacity: canEdit ? 1 : 0.5 }]}>
                    <Feather name="check" size={20} color={current === 'present' ? '#fff' : statusColor.present} />
                  </Pressable>
                  {canMarkTardy ? <Pressable testID={`rollcall-tardy-${s.id}`} accessibilityRole="button" accessibilityLabel={`${s.fullName} tardy`} accessibilityState={{ selected: current === 'tardy', disabled: saving || !canEdit }} disabled={saving || !canEdit} onPress={() => setStatus(s.id, s.status, current, 'tardy')} style={[styles.toggle, styles.compactToggle, { borderColor: statusColor.tardy, backgroundColor: current === 'tardy' ? statusColor.tardy : 'transparent', opacity: canEdit ? 1 : 0.5 }]}>
                    <Text style={[styles.tardyText, { color: current === 'tardy' ? '#fff' : statusColor.tardy }]}>T</Text>
                  </Pressable> : null}
                  <Pressable testID={`rollcall-absent-${s.id}`} accessibilityRole="button" accessibilityLabel={`${s.fullName} absent`} accessibilityState={{ selected: current === 'absent', disabled: saving || !canEdit }} disabled={saving || !canEdit} onPress={() => setStatus(s.id, s.status, current, 'absent')} style={[styles.toggle, { borderColor: statusColor.absent, backgroundColor: current === 'absent' ? statusColor.absent : 'transparent', opacity: canEdit ? 1 : 0.5 }]}>
                    <Feather name="x" size={20} color={current === 'absent' ? '#fff' : statusColor.absent} />
                  </Pressable>
                </View>;
              })}
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>Tap a selected button again to return the student to pending.</Text>
            </View>}
        </> : null}
    </ScrollView>

    <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
      <Pressable style={styles.backdrop} onPress={() => setConfirm(null)}>
        <Pressable testID="rollcall-confirm" style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{confirm?.title}</Text>
          <Text style={[styles.copy, { color: colors.mutedForeground, marginTop: 6 }]}>{confirm?.body}</Text>
          {notice?.kind === 'error' ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.destructive }]}>{notice.text}</Text> : null}
          <View style={styles.modalActions}>
            <Pressable testID="rollcall-confirm-cancel" accessibilityRole="button" disabled={saving} onPress={() => setConfirm(null)} style={[styles.modalButton, { borderColor: colors.border }]}><Text style={[styles.modalButtonText, { color: colors.foreground }]}>Cancel</Text></Pressable>
            {confirm?.saveBeforeLeave ? <Pressable testID="rollcall-save-leave" accessibilityRole="button" disabled={saving || !canEdit} onPress={async () => { const action = confirm.onConfirm; if (await save()) { setConfirm(null); action(); } }} style={[styles.modalButton, { borderColor: colors.primary, backgroundColor: colors.primary, opacity: canEdit ? 1 : 0.5 }]}><Text style={[styles.modalButtonText, { color: '#fff' }]}>{saving ? 'Saving…' : 'Save & Leave'}</Text></Pressable> : null}
            <Pressable testID="rollcall-confirm-ok" accessibilityRole="button" disabled={saving} onPress={() => { const action = confirm?.onConfirm; setConfirm(null); action?.(); }} style={[styles.modalButton, { backgroundColor: colors.destructive, borderColor: colors.destructive }]}><Text style={[styles.modalButtonText, { color: '#fff' }]}>{confirm?.confirmLabel}</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  iconButton: { width: 46, height: 46, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 },
  copy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  panel: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 14 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.1, marginBottom: 4 },
  dateLong: { fontFamily: 'Inter_700Bold', fontSize: 16, marginBottom: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: { flex: 1, minWidth: 0, minHeight: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  applyButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },
  errorText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 8 },
  todayLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  skeleton: { height: 68, borderRadius: 16 },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 15, paddingVertical: 10, alignItems: 'center' },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  statLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 2 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  noticeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17 },
  noticeAction: { minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  search: { minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, minHeight: 46, fontFamily: 'Inter_400Regular', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 10 },
  bigButton: { minHeight: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8, lineHeight: 16 },
  row: { minHeight: 76, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  rowMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  rowState: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5, marginTop: 5 },
  toggle: { width: 52, height: 52, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  compactToggle: { width: 44, height: 44 },
  tardyText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'center', padding: 22 },
  modal: { borderWidth: 1, borderRadius: 20, padding: 20, width: '100%', maxWidth: 460, alignSelf: 'center' },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 9, marginTop: 20 },
  modalButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, justifyContent: 'center' },
  modalButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
});
