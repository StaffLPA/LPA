import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { getGetMetricsSyncStatusQueryKey, useApplyMetricsRestore, usePreviewMetricsRestore } from '@workspace/api-client-react';
import type { MetricsRestorePreview, MetricsRestoreReceipt } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Body, Btn, Chip, Sheet } from './ui';

const MAX = 1000;
const RESTORE_KEY = ['metricsRestore'];
const receiptKey = (uid: string) => `lpa-metrics-restore-receipt:${uid}`;
const pendingKey = (uid: string) => `lpa-metrics-restore-pending:${uid}`;
const isSubmitted = (v: unknown): v is Submitted => { const x = v as Submitted | null; return !!x && typeof x.previewId === 'string' && x.previewId.length > 0 && Array.isArray(x.selectedIds) && x.selectedIds.length > 0 && x.selectedIds.length <= MAX && x.selectedIds.every((i) => typeof i === 'string'); };
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unknown');
type ApiErr = { status?: number; data?: { error?: string; message?: string }; message?: string } | null;
const statusOf = (e: unknown) => (e as ApiErr)?.status;
const errText = (e: unknown, fallback: string) => { const x = e as ApiErr; return x?.data?.error || x?.data?.message || x?.message || fallback; };

type Submitted = { previewId: string; selectedIds: string[] };

export function RestoreBackupControl({ visible, onClose, onNeedsAttention }: { visible: boolean; onClose: () => void; onNeedsAttention?: (value: boolean) => void }) {
  const c = useColors();
  const qc = useQueryClient();
  const { user } = useApp() as { user?: { id: string } | null };
  const uid = user?.id ?? null;
  const previewMut = usePreviewMetricsRestore({ mutation: { mutationKey: RESTORE_KEY } });
  const applyMut = useApplyMetricsRestore({ mutation: { mutationKey: RESTORE_KEY } });
  const restoreBusy = useIsMutating({ mutationKey: RESTORE_KEY }) > 0;
  const syncBusy = useIsMutating({ mutationKey: ['syncMetricsExcel'] }) > 0;
  const locked = restoreBusy || syncBusy;

  const [preview, setPreview] = useState<MetricsRestorePreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [receipt, setReceipt] = useState<MetricsRestoreReceipt | null>(null);
  const [storage, setStorage] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => { onNeedsAttention?.(!!submitted || !!receipt || storage === 'error'); }, [submitted, receipt, storage, onNeedsAttention]);
  const [loadTick, setLoadTick] = useState(0);
  const uidRef = useRef(uid);

  // Clear all restore state on account change; load that account's last receipt.
  useEffect(() => {
    uidRef.current = uid;
    setPreview(null); setSelected(new Set()); setConfirming(false); setSubmitted(null); setErr(null); setStale(false); setReceipt(null);
    setStorage('loading');
    if (!uid) return;
    let off = false;
    (async () => {
      try {
        const [rawReceipt, rawPending] = await Promise.all([AsyncStorage.getItem(receiptKey(uid)), AsyncStorage.getItem(pendingKey(uid))]);
        if (off) return;
        if (rawReceipt) { try { setReceipt(JSON.parse(rawReceipt)); } catch { /* corrupt receipt is display-only */ } }
        if (rawPending) {
          let parsed: unknown = null;
          try { parsed = JSON.parse(rawPending); } catch { parsed = null; }
          if (!isSubmitted(parsed)) { if (!off) { setStorage('error'); setErr('A saved restore request on this device could not be read. Restore is paused to avoid a duplicate request.'); } return; }
          setSubmitted({ previewId: parsed.previewId, selectedIds: parsed.selectedIds });
          setErr('A previous restore did not confirm. Retry sends the same request and will not restore twice.');
        }
        setStorage('ready');
      } catch {
        if (!off) { setStorage('error'); setErr('Saved restore state on this device could not be read. Restore is paused until it loads.'); }
      }
    })();
    return () => { off = true; };
  }, [uid, loadTick]);

  const expired = !!preview && new Date(preview.expiresAt).getTime() <= Date.now();
  const pending = !!submitted; // ambiguous failure: must Retry the exact request
  const entries = preview?.entries ?? [];

  const loadPreview = async () => {
    if (locked || storage !== 'ready' || !uid) return;
    const forUid = uid;
    try { await AsyncStorage.removeItem(pendingKey(forUid)); } catch { setErr('Could not clear the saved restore request on this device. Try again.'); return; }
    if (uidRef.current !== forUid) return;
    setErr(null); setStale(false); setSelected(new Set()); setConfirming(false); setSubmitted(null);
    try {
      const p = await previewMut.mutateAsync();
      if (uidRef.current !== forUid) return;
      setPreview(p);
    } catch (e) {
      if (uidRef.current !== forUid) return;
      setPreview(null);
      setErr(statusOf(e) === 404 ? 'No backup is available to restore.' : errText(e, 'The restore preview could not load.'));
    }
  };

  const clearPending = async (forUid: string) => { try { await AsyncStorage.removeItem(pendingKey(forUid)); } catch { /* request is idempotent; a leftover key only offers a harmless Retry */ } };

  const send = async (req: Submitted, retry = false) => {
    if (locked || storage !== 'ready' || !uid) return;
    const forUid = uid;
    setConfirming(false);
    if (!retry) {
      // Persist the idempotency key BEFORE the first apply; never send if it can't be saved.
      try { await AsyncStorage.setItem(pendingKey(forUid), JSON.stringify({ previewId: req.previewId, selectedIds: req.selectedIds })); }
      catch { if (uidRef.current === forUid) setErr('Could not save the restore request on this device, so nothing was sent. Try again.'); return; }
      if (uidRef.current !== forUid) return;
    }
    setErr(null); setSubmitted(req);
    try {
      const r = await applyMut.mutateAsync({ data: { previewId: req.previewId, selectedIds: req.selectedIds, confirmed: true } });
      if (uidRef.current !== forUid) return;
      let saved = false;
      try { await AsyncStorage.setItem(receiptKey(forUid), JSON.stringify(r)); saved = true; } catch { saved = false; }
      if (saved) await clearPending(forUid); // receipt first, then pending; otherwise keep key for idempotent Retry
      if (uidRef.current !== forUid) return;
      setReceipt(r); setSubmitted(null); setSelected(new Set()); setPreview(null);
      void qc.invalidateQueries({ queryKey: getGetMetricsSyncStatusQueryKey() });
      void qc.invalidateQueries({ predicate: (q) => { const k = String(q.queryKey[0] ?? ''); return k.startsWith('/api/metrics') || k.startsWith('/api/users'); } });
    } catch (e) {
      if (uidRef.current !== forUid) return;
      const s = statusOf(e);
      if (s === 400 || s === 401 || s === 403 || s === 409 || s === 410) await clearPending(forUid);
      if (uidRef.current !== forUid) return;
      if (s === 409 || s === 410) {
        setSubmitted(null); setStale(true);
        setErr(errText(e, 'This preview is out of date or expired. Refresh the preview to review current differences.'));
      } else if (s === 400 || s === 403 || s === 401) {
        setSubmitted(null);
        setErr(errText(e, 'The restore request was rejected. No changes were made.'));
      } else {
        // Ambiguous: keep the exact request for an idempotent Retry.
        setErr(`${errText(e, 'The restore did not confirm.')} It may or may not have been applied. Retry sends the same request and will not restore twice.`);
      }
    }
  };

  const toggle = (id: string) => {
    if (pending || locked) return;
    setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else if (n.size < MAX) n.add(id); return n; });
  };
  const selectAll = () => { if (!pending && !locked) setSelected(new Set(entries.slice(0, MAX).map((e) => e.id))); };
  const canApply = storage === 'ready' && !!preview && selected.size > 0 && selected.size <= MAX && !expired && !stale && !pending && !locked;
  const count = submitted ? submitted.selectedIds.length : selected.size;
  const muted = { color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 } as const;

  return <>
    <Sheet visible={visible && !confirming} title="Restore from backup" onClose={onClose}>
      <Body muted>Restores only measurement values, notes and public notes, and athlete display names and grad years from the private first-sync backup. IDs, sessions, dates, units, protocols, logins, teams, access and status are never changed.</Body>

      {receipt ? <View accessibilityLiveRegion="polite" style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, marginTop: 10 }}>
        <Body style={{ fontFamily: 'Inter_700Bold' }}>Last restore completed {when(receipt.completedAt)}</Body>
        <Body muted>{receipt.restored} differences restored · {receipt.measurements} measurement fields · {receipt.roster} roster fields</Body>
      </View> : null}

      {err ? <View accessibilityRole="alert" style={{ marginTop: 10 }}><Text style={{ color: c.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{err}</Text></View> : null}
      {syncBusy ? <Body muted style={{ marginTop: 8 }}>Sync is running. Restore is unavailable until it finishes.</Body> : null}

      {storage === 'error' ? <View style={{ marginTop: 8, alignItems: 'flex-start' }}><Btn testID="restore-reload-state" label="Try loading again" icon="refresh-cw" kind="ghost" onPress={() => { setErr(null); setLoadTick((n) => n + 1); }} /></View> : null}
      {storage === 'loading' && uid ? <Body muted style={{ marginTop: 8 }}>Checking for an unfinished restore on this device...</Body> : null}

      {pending && storage === 'ready' ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Btn testID="restore-retry" label={`Retry restore (${submitted!.selectedIds.length})`} icon="refresh-cw" loading={applyMut.isPending} disabled={locked} onPress={() => void send(submitted!, true)} />
      </View> : null}

      {!preview && !pending && storage === 'ready' ? <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
        <Body muted>Nothing is changed until you choose differences and confirm twice.</Body>
        <View style={{ marginTop: 8 }}><Btn testID="restore-preview" label="Preview differences" icon="eye" loading={previewMut.isPending} disabled={locked} onPress={() => void loadPreview()} /></View>
      </View> : null}

      {preview ? <View style={{ marginTop: 12 }}>
        <Text style={muted}>Backup from {when(preview.backupCreatedAt)} · Preview expires {when(preview.expiresAt)}</Text>
        <Text style={[muted, { marginTop: 4 }]}>{preview.counts.measurements} measurement and {preview.counts.roster} roster differences · {preview.counts.unchanged} unchanged · {preview.counts.skipped} skipped</Text>
        {preview.counts.newerMeasurements ? <Body muted style={{ marginTop: 4 }}>{preview.counts.newerMeasurements} measurements recorded after the backup are kept as they are and are not listed.</Body> : null}
        {preview.counts.skipped ? <Body muted style={{ marginTop: 4 }}>Skipped items no longer exist or fall outside the restorable fields.</Body> : null}
        {preview.warnings.map((w, i) => <Text key={i} style={{ color: c.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }}>{w}</Text>)}
        {expired || stale ? <View style={{ marginTop: 8 }}><Body>{expired ? 'This preview expired.' : 'This preview is stale.'} Refreshing clears your selections.</Body>
          <View style={{ marginTop: 6, alignItems: 'flex-start' }}><Btn testID="restore-refresh" label="Refresh preview" icon="refresh-cw" kind="ghost" loading={previewMut.isPending} disabled={locked} onPress={() => void loadPreview()} /></View></View> : null}

        {entries.length === 0 ? <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 12, padding: 14, marginTop: 10 }}>
          <Body muted>Current data already matches the backup for every restorable field.</Body>
        </View> : <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <Chip label={entries.length > MAX ? `Select first ${MAX}` : 'Select all'} onPress={selectAll} />
            <Chip label="Clear" onPress={() => { if (!pending && !locked) setSelected(new Set()); }} />
            <Text style={[muted, { marginBottom: 7 }]}>{selected.size} of {entries.length} selected{selected.size >= MAX ? ` (limit ${MAX})` : ''}</Text>
          </View>
          {entries.map((e) => {
            const on = selected.has(e.id);
            return <View key={e.id} style={{ borderTopWidth: 1, borderColor: c.border, paddingVertical: 9 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontFamily: 'Inter_700Bold' }}>{e.athleteName} · {e.label}</Body>
                  <Text style={muted}>{e.kind === 'roster' ? 'Roster' : 'Measurement'}</Text>
                  <Body>Now: {e.before ?? 'blank'}</Body>
                  <Body>Backup: {e.after ?? 'blank'}</Body>
                </View>
                <Chip testID={`restore-pick-${e.id}`} label={on ? 'Selected' : 'Select'} active={on} onPress={() => toggle(e.id)} />
              </View>
            </View>;
          })}
        </>}
      </View> : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Btn label="Close" kind="ghost" onPress={onClose} />
        {preview && entries.length ? <Btn testID="restore-review" label={`Restore ${selected.size} selected`} kind="danger" disabled={!canApply} onPress={() => setConfirming(true)} /> : null}
      </View>
    </Sheet>

    <Sheet visible={visible && confirming} title="Confirm restore" onClose={() => setConfirming(false)}>
      <Body>Restore {count} selected {count === 1 ? 'difference' : 'differences'} from the backup of {when(preview?.backupCreatedAt)}?</Body>
      <Body muted style={{ marginTop: 6 }}>Selected current values will be replaced; there is no automatic undo. The change is recorded in the audit log.</Body>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Btn label="Cancel" kind="ghost" onPress={() => setConfirming(false)} />
        <Btn testID="restore-confirm" label={`Restore ${count}`} kind="danger" loading={applyMut.isPending} disabled={!canApply} onPress={() => preview && void send({ previewId: preview.id, selectedIds: Array.from(selected) })} />
      </View>
    </Sheet>
  </>;
}
