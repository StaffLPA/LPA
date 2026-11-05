import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { getGetMetricsSyncStatusQueryKey, getGetValdSyncStatusQueryKey, getMetricsSyncBackup, useGetMetricsSyncStatus, useGetValdSyncStatus, useSyncConfiguredValdMetrics, useSyncMetricsExcel } from '@workspace/api-client-react';
import type { MetricsSyncStatus, ValdSyncRunSummary } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Body, Btn, Chip, Sheet } from './ui';
import { RestoreBackupControl } from './RestoreBackupControl';

const errText = (e: unknown) => {
  const x = e as { status?: number; data?: { error?: string; message?: string }; message?: string } | null;
  return x?.data?.error || x?.data?.message || x?.message || 'Sync failed.';
};
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never');
const whenVald = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unknown time');
const valdRunCounts = (run: ValdSyncRunSummary) => {
  const changed = run.imported !== null && run.updated !== null
    ? `${run.imported} new · ${run.updated} updated`
    : run.resultsChanged !== null ? `${run.resultsChanged} results changed` : null;
  return [
    changed,
    run.testsSeen === null ? null : `${run.testsSeen} tests`,
    run.skipped === null ? null : `${run.skipped} skipped`,
    run.archivedTests === null ? null : `${run.archivedTests} archived`,
    run.measurementValues === null ? null : `${run.measurementValues} measurements`,
    run.unmappedProfiles ? `${run.unmappedProfiles} profiles need review` : null,
  ].filter(Boolean).join(' · ') || 'Counts unavailable for this run.';
};
const valdRunLabel = (run: ValdSyncRunSummary) => {
  switch (run.status) {
    case 'running': return `VALD sync running since ${whenVald(run.startedAt)}`;
    case 'complete': return `VALD sync complete · ${whenVald(run.completedAt ?? run.startedAt)}`;
    case 'incomplete': return `VALD sync incomplete · ${whenVald(run.completedAt ?? run.startedAt)} · more history remains`;
    case 'failed': return `Latest VALD sync failed · ${whenVald(run.completedAt ?? run.startedAt)}`;
  }
};

export function SyncControl() {
  const c = useColors();
  const qc = useQueryClient();
  const status = useGetMetricsSyncStatus({ query: { queryKey: getGetMetricsSyncStatusQueryKey() } });
  const valdStatus = useGetValdSyncStatus(undefined, { query: { queryKey: getGetValdSyncStatusQueryKey(), staleTime: 30_000 } });
  const mut = useSyncMetricsExcel({ mutation: { mutationKey: ['syncMetricsExcel'] } });
  const valdMut = useSyncConfiguredValdMetrics({ mutation: { mutationKey: ['syncConfiguredValdMetrics'] } });
  const syncing = useIsMutating({ mutationKey: ['syncMetricsExcel'] }) > 0;
  const restoring = useIsMutating({ mutationKey: ['metricsRestore'] }) > 0;
  const valdSyncing = valdMut.isPending;
  const busy = syncing || restoring || valdSyncing;
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreAttention, setRestoreAttention] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [review, setReview] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, 'app' | 'excel'>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [valdErr, setValdErr] = useState<string | null>(null);
  const [valdMsg, setValdMsg] = useState<string | null>(null);

  const st: MetricsSyncStatus | undefined = status.data;
  const first = !!st && st.lastSyncedAt === null;
  const notConfigured = st ? !st.configured : false;
  const conflicts = st?.conflicts ?? [];
  const issues = st?.issues ?? [];

  const run = async (resolutions: { id: string; choice: 'app' | 'excel' }[] = []) => {
    if (busy) return;
    setErr(null); setMsg(null); setConfirm(false);
    try {
      const res = await mut.mutateAsync({ data: { resolutions } });
      qc.setQueryData(getGetMetricsSyncStatusQueryKey(), res);
      void qc.invalidateQueries({ predicate: (q) => { const k = String(q.queryKey[0] ?? ''); return k.startsWith('/api/metrics') || k.startsWith('/api/users'); } });
      setChoices({});
      if (res.conflicts.length) setReview(true);
      else if (res.issues.length) setIssuesOpen(true);
      else { setMsg('Sync complete.'); setResultsOpen(true); }
    } catch (e) { setErr(errText(e)); void status.refetch(); }
  };
  const runValdSync = async () => {
    if (busy) return;
    setValdErr(null); setValdMsg(null);
    try {
      const res = await valdMut.mutateAsync();
      void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/metrics') });
      const updates = `${res.imported} new · ${res.updated} updated`;
      const unmatched = res.unmappedProfiles.length ? ` · ${res.unmappedProfiles.length} VALD profiles need review in Metrics Library` : '';
      const outcome = res.partial ? 'incomplete · more history remains; sync again to continue' : 'complete';
      setValdMsg(`VALD sync ${outcome} · ${updates}${unmatched}`);
      void valdStatus.refetch();
    } catch (e) {
      setValdErr(errText(e));
      void valdStatus.refetch();
    }
  };
  const openBackup = async () => {
    try { const b = await getMetricsSyncBackup(); await Linking.openURL(b.url); } catch (e) { setErr(errText(e)); }
  };
  const chosen = Object.entries(choices).map(([id, choice]) => ({ id, choice }));
  const sum = st?.summary;
  const summary = sum ? `Synced ${sum.tabs} tabs • ${sum.updated} updated • ${sum.created} new • ${sum.conflicts} conflicts` : null;

  return <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16, marginBottom: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Excel sync</Text>
        <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 3 }}>Your metrics, connected to OneDrive.</Text>
      </View>
       <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
         <Btn testID="vald-sync-quick" label="VALD Sync" icon="refresh-cw" kind="ghost" loading={valdSyncing} disabled={busy || status.isLoading} onPress={() => void runValdSync()} />
         <Btn testID="sync-button" label="Sync" icon="refresh-cw" loading={syncing} disabled={busy || status.isLoading} onPress={() => setConfirm(true)} />
       </View>
    </View>
    <View style={{ borderTopWidth: 1, borderColor: c.border, marginTop: 12, paddingTop: 12 }}>
      {notConfigured ? <View accessibilityRole="alert">
        <Text style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Workbook setup required</Text>
        <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 3 }}>Add the Workbook ID in Secrets to enable syncing.</Text>
      </View> : <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 }}>{status.isLoading ? 'Checking sync status…' : `Last synced ${when(st?.lastSyncedAt)}`}</Text>}
      {summary ? <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 4 }}>{summary}</Text> : null}
      {valdStatus.isLoading ? <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 8 }}>Checking VALD sync history…</Text> : null}
      {valdStatus.isError ? <View accessibilityRole="alert" style={{ marginTop: 8, alignItems: 'flex-start' }}>
        <Text style={{ color: c.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 }}>VALD sync history could not load.</Text>
        <Btn label="Retry status" kind="ghost" icon="refresh-cw" onPress={() => void valdStatus.refetch()} />
      </View> : null}
      {valdStatus.data ? <>
        {valdStatus.data.latestRun && (valdStatus.data.latestRun.status === 'failed' ||
          valdStatus.data.latestRun.status === 'running' ||
          valdStatus.data.latestRun.startedAt !== valdStatus.data.lastSuccessful?.startedAt) ?
          <Text accessibilityLiveRegion="polite" style={{
            color: valdStatus.data.latestRun.status === 'failed' ? c.destructive : c.mutedForeground,
            fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18, marginTop: 8,
          }}>{valdRunLabel(valdStatus.data.latestRun)}</Text> : null}
        {valdStatus.data.latestRun?.status === 'incomplete' ?
          <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 2 }}>
            {valdRunCounts(valdStatus.data.latestRun)} · Sync again to continue.
          </Text> : null}
        {valdStatus.data.lastSuccessful ? <>
          <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 8 }}>
            Last complete successful VALD sync · {whenVald(valdStatus.data.lastSuccessful.completedAt ?? valdStatus.data.lastSuccessful.startedAt)}
          </Text>
          <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 2 }}>
            {valdRunCounts(valdStatus.data.lastSuccessful)}
          </Text>
        </> : <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 8 }}>No complete successful VALD sync recorded yet.</Text>}
      </> : null}
      {summary && !busy ? <View style={{ alignItems: 'flex-start', marginTop: 8 }}><Chip label="Results" onPress={() => setResultsOpen(true)} /></View> : null}
    </View>
    {status.isError && !err ? <Text style={{ color: c.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 }}>Sync status could not load.</Text> : null}
    {err ? <View accessibilityRole="alert" style={{ marginTop: 8, alignItems: 'flex-start' }}><Text style={{ color: c.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 }}>{err}</Text><Btn label="Retry" kind="ghost" icon="refresh-cw" disabled={busy} onPress={() => { if (status.isError) void status.refetch(); setErr(null); setConfirm(true); }} /></View> : null}
    {msg ? <Text style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 8 }}>{msg}</Text> : null}
     {valdSyncing ? <Text accessibilityLiveRegion="polite" style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 }}>Importing new and updated VALD measurements…</Text> : null}
     {valdErr ? <View accessibilityRole="alert" style={{ marginTop: 8, alignItems: 'flex-start' }}><Text style={{ color: c.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 }}>{valdErr}</Text><Btn label="Retry VALD sync" kind="ghost" icon="refresh-cw" disabled={busy} onPress={() => void runValdSync()} /></View> : null}
     {valdMsg ? <Text accessibilityLiveRegion="polite" style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 8 }}>{valdMsg}</Text> : null}
    {!err && !notConfigured && (conflicts.length || issues.length) && !busy ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
      {conflicts.length ? <Chip label={`Review ${conflicts.length} conflicts`} onPress={() => setReview(true)} /> : null}
      {issues.length ? <Chip label={`${issues.length} issues`} onPress={() => setIssuesOpen(true)} /> : null}
    </View> : null}

    <Sheet visible={confirm} title="Sync with Excel" onClose={() => setConfirm(false)}>
      {first ? <Body muted>This is the first sync. A private backup of current data is created automatically first. </Body> : null}
      <Body muted>Speed, Baseball, Health, and Lift are entry forms only. Enter each result with its Date (MM-DD-YYYY), then use that tab’s Submit button to save the tests to Test History and clear the inputs. Sync exchanges saved tests only through Test History, including tests entered in LPA. Saved results are never copied back into the four forms.</Body>
      <Body muted style={{ marginTop: 8 }}>Deleting an entire, previously synced Test History row permanently deletes that individual test in LPA on Sync. Tests deleted in LPA are removed from Test History. Blank form cells do not delete tests. Athlete accounts and metric definitions are not deleted through Excel.</Body>
      <Body muted style={{ marginTop: 8 }}>Test History is protected and can stay hidden. Submit and Sync update it without leaving it unprotected. To intentionally remove a row, unhide and unprotect Test History, delete the whole row, then save and Sync. Pending inputs remain untouched until Submit saves them.</Body>
      {notConfigured ? <Body style={{ marginTop: 8 }}>Workbook ID setup is needed in Secrets. Syncing will fail until then.</Body> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {st?.workbookUrl ? <Btn label="Open workbook" kind="ghost" onPress={() => void Linking.openURL(st.workbookUrl!)} /> : null}
        {st?.backupAvailable ? <Btn label="Backup" kind="ghost" onPress={() => void openBackup()} /> : null}
        {st?.backupAvailable || restoreAttention ? <Btn testID="restore-open" label={st?.backupAvailable ? "Restore" : "Restore status"} kind="ghost" disabled={syncing} onPress={() => { setConfirm(false); setTimeout(() => setRestoreOpen(true), 350); }} /> : null}
        <Btn label="Cancel" kind="ghost" onPress={() => setConfirm(false)} />
        <Btn testID="sync-confirm" label="Sync now" disabled={busy} onPress={() => void run()} />
      </View>
    </Sheet>

    <RestoreBackupControl visible={restoreOpen} onClose={() => setRestoreOpen(false)} onNeedsAttention={setRestoreAttention} />

    <Sheet visible={resultsOpen} title="Sync results" onClose={() => setResultsOpen(false)}>
      <Body>{summary || 'No completed sync yet.'}</Body>
      <Body muted>Last synced {when(st?.lastSyncedAt)}</Body>
      {sum?.invalid ? <Body muted>{sum.invalid} validation issues were retained for review; good app data was not overwritten.</Body> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {conflicts.length ? <Btn label="Review conflicts" kind="ghost" onPress={() => { setResultsOpen(false); setReview(true); }} /> : null}
        {issues.length ? <Btn label="Review issues" kind="ghost" onPress={() => { setResultsOpen(false); setIssuesOpen(true); }} /> : null}
        <Btn label="Done" onPress={() => setResultsOpen(false)} />
      </View>
    </Sheet>
    <Sheet visible={review} title={`Review conflicts (${conflicts.length})`} onClose={() => setReview(false)}>
      {summary ? <Body muted>{summary}</Body> : null}
      <Body muted>For a Delete test conflict, Keep Excel permanently deletes that test; Keep app restores its History row. Neither choice removes an athlete account or metric definition.</Body>
      {conflicts.map((k) => <View key={k.id} style={{ borderTopWidth: 1, borderColor: c.border, paddingVertical: 10 }}>
        <Body style={{ fontFamily: 'Inter_700Bold' }}>{k.athleteName} · {k.tab} · {k.field}</Body>
        <Body muted>{k.reason}</Body>
        <Body>App: {k.appValue}   Excel: {k.excelValue}</Body>
        <View style={{ flexDirection: 'row', marginTop: 6 }}>
          <Chip label="Keep app" active={choices[k.id] === 'app'} onPress={() => setChoices((p) => ({ ...p, [k.id]: 'app' }))} />
          <Chip label="Keep Excel" active={choices[k.id] === 'excel'} onPress={() => setChoices((p) => ({ ...p, [k.id]: 'excel' }))} />
        </View>
      </View>)}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <Btn label="Later" kind="ghost" onPress={() => setReview(false)} />
        <Btn label={`Apply ${chosen.length} choices`} disabled={!chosen.length || busy} loading={busy} onPress={() => { setReview(false); void run(chosen); }} />
      </View>
    </Sheet>

    <Sheet visible={issuesOpen} title="Validation issues" onClose={() => setIssuesOpen(false)}>
      {summary ? <Body muted>{summary}</Body> : null}
      {issues.map((i, n) => <View key={n} style={{ borderTopWidth: 1, borderColor: c.border, paddingVertical: 8 }}><Body style={{ fontFamily: 'Inter_700Bold' }}>{i.tab} · row {i.row} · {i.field}</Body><Body muted>{i.message}</Body></View>)}
    </Sheet>
  </View>;
}
