import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_RPE_CHART, prescribeIntensity, useGetPublicBuildWorkout, useSavePublicBuildLogs, useStreamAssignedBuildVideo, useUpdatePublicBuildIntensity } from '@workspace/api-client-react';
import type { BuildIntensityPreferences, BuildIntensityState, BuildPublicWorkout, BuildSetLogInput, BuildWorkoutLog, ProgramBuilderWorkoutExercise } from '@workspace/api-client-react';
import { GuideLink } from '@/components/workouts/IntensityGuide';
import { confirmAsync, defaultPreferences, statusOf } from '@/components/workouts/IntensityShared';
import {
  AthleteIntensitySheet, EffortPicker, LiveSetFeedback, MissingOneRepMaxNote, SavedSetFeedback, effortCap, prescriptionText, snapshotText,
} from '@/components/workouts/IntensityLogging';
import type { Prescription } from '@/components/workouts/IntensityLogging';
import { useColors } from '@/hooks/useColors';
import { LpaIcon as Icon } from '@/components/LpaIcon';
import { Body, Btn, Card, Empty, ErrorBox, Label, Skeleton } from '@/components/metrics/ui';
import { buildHistoryViewModel } from '@/lib/buildHistory';
import {
  buildDraftEntryKey, buildDraftScopeKey, buildDraftStorageKey, matchingBuildDraft, MAX_BUILD_DRAFT_SNAPSHOTS, parseBuildDraftSnapshots,
  restoreMatchingBuildDraft,
  removeSavedBuildDraftEntries, saveWithDraftRecovery, serializeBuildDraftSnapshots, writeBuildDraftSnapshots,
} from '@/lib/buildDraftStorage';
import type {
  BuildDraft as Draft, BuildDraftLabels as DraftLabels,
  BuildDraftScope as DraftScope, BuildDraftSnapshot as LocalDraftSnapshot,
} from '@/lib/buildDraftStorage';
const isAuthError = (e: unknown) => (e as { status?: number } | null)?.status === 401;
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const PROP_LABEL: Record<string, string> = { reps: 'Reps', weight: 'Wt', percent: '%', rpe: 'RPE', rir: 'RIR', tempo: 'Tempo', rest: 'Rest', time: 'Time', distance: 'Dist' };
const fmtDate = (v: string) => { const d = new Date(v.length === 10 ? `${v}T12:00:00` : v); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const k = buildDraftEntryKey;
const snapshotKey = buildDraftScopeKey;

export function BuildWorkout({ athleteId, accessToken, pinRequired, onUnauthorized, onDirtyChange, registerSwitchGuard }: {
  athleteId: string; accessToken: string; pinRequired: boolean; onUnauthorized: () => void; onDirtyChange: (dirty: boolean) => void;
  registerSwitchGuard?: (guard: (() => Promise<boolean>) | null) => void;
}) {
  const c = useColors();
  const fetchWorkout = useGetPublicBuildWorkout();
  const saveLogs = useSavePublicBuildLogs();
  const stream = useStreamAssignedBuildVideo();
  const updateIntensity = useUpdatePublicBuildIntensity();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [estimating, setEstimating] = useState('');
  const [workout, setWorkout] = useState<BuildPublicWorkout | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pendingReview, setPendingReview] = useState<LocalDraftSnapshot | null>(null);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [weekIdx, setWeekIdx] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  const [view, setView] = useState<'today' | 'history'>('today');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [draftStorageUnreadable, setDraftStorageUnreadable] = useState(false);
  const [retryingDraftStorage, setRetryingDraftStorage] = useState(false);
  const savingRef = useRef(false);
  const requestEpoch = useRef(0);
  const draftsRef = useRef<Record<string, Draft>>({});
  const workoutRef = useRef<BuildPublicWorkout | null>(null);
  const scopeRef = useRef<DraftScope | null>(null);
  const initializedScope = useRef<string | null>(null);
  const snapshotsRef = useRef<LocalDraftSnapshot[]>([]);
  const storageLoaded = useRef(false);
  const storageWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const storageHealthy = useRef(true);
  const pinPolicyRef = useRef(pinRequired);
  const fetchRef = useRef(fetchWorkout.mutateAsync); fetchRef.current = fetchWorkout.mutateAsync;
  const unauthRef = useRef(onUnauthorized); unauthRef.current = onUnauthorized;
  const dirtyRef = useRef(onDirtyChange); dirtyRef.current = onDirtyChange;
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => { dirtyRef.current(dirty); }, [dirty]);

  const draftStorageKey = buildDraftStorageKey(athleteId);
  const storeSnapshots = useCallback((snapshots: LocalDraftSnapshot[]) => {
    const limited = snapshots.slice(0, MAX_BUILD_DRAFT_SNAPSHOTS);
    snapshotsRef.current = limited;
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try { writeBuildDraftSnapshots(localStorage, draftStorageKey, limited); storageHealthy.current = true; }
      catch { storageHealthy.current = false; setNotice({ tone: 'err', text: 'This device could not save your draft. Save your sets before leaving this page.' }); }
      return;
    }
    storageWriteQueue.current = storageWriteQueue.current.catch(() => undefined).then(() =>
      AsyncStorage.setItem(draftStorageKey, serializeBuildDraftSnapshots(limited)).then(() => { storageHealthy.current = true; }),
    ).catch(() => {
      storageHealthy.current = false;
      setNotice({ tone: 'err', text: 'This device could not save your draft. Save your sets before leaving this page.' });
    });
  }, [draftStorageKey]);
  const loadSnapshots = useCallback(async () => {
    if (storageLoaded.current) return true;
    await storageWriteQueue.current.catch(() => undefined);
    try {
      const raw = Platform.OS === 'web' && typeof localStorage !== 'undefined'
        ? localStorage.getItem(draftStorageKey)
        : await AsyncStorage.getItem(draftStorageKey);
      snapshotsRef.current = parseBuildDraftSnapshots(raw);
      storageLoaded.current = true;
      setDraftStorageUnreadable(false);
      return true;
    } catch {
      setDraftStorageUnreadable(true);
      setNotice({ tone: 'err', text: 'Saved drafts could not be checked on this device. Your current entries are only in this page.' });
      return false;
    }
  }, [draftStorageKey]);
  const labelsFor = useCallback((entries: Record<string, Draft>) => {
    const labels: Record<string, DraftLabels> = {};
    const current = workoutRef.current;
    for (const key of Object.keys(entries)) {
      const [assignmentId, dayId, exerciseId] = key.split('|');
      if (assignmentId !== current?.assignment?.id) continue;
      const week = current.program?.weeks.find((candidate) => candidate.days.some((d) => d.id === dayId));
      const day = week?.days.find((candidate) => candidate.id === dayId);
      const exercise = day?.exercises.find((candidate) => candidate.id === exerciseId);
      labels[key] = {
        weekName: week?.name ?? 'Previous week',
        dayName: day?.name ?? 'Previous day',
        exerciseName: exercise?.exerciseName ?? 'Exercise no longer in this program',
      };
    }
    return labels;
  }, []);
  const persistDrafts = useCallback((entries: Record<string, Draft>, scope: DraftScope | null) => {
    if (!scope || !storageLoaded.current) return;
    const targetKey = snapshotKey(scope);
    const remaining = snapshotsRef.current.filter((snapshot) => snapshotKey(snapshot) !== targetKey);
    if (Object.keys(entries).length) {
      const snapshot: LocalDraftSnapshot = {
        ...scope, entries, labels: labelsFor(entries), updatedAt: new Date().toISOString(),
      };
      remaining.unshift(snapshot);
    }
    storeSnapshots(remaining);
  }, [labelsFor, storeSnapshots]);
  const switchGuardRef = useRef(registerSwitchGuard); switchGuardRef.current = registerSwitchGuard;
  useEffect(() => {
    switchGuardRef.current?.(async () => {
      // A pending explicit save must settle before its component can be removed.
      if (savingRef.current) return false;
      if (!Object.keys(draftsRef.current).length) return true;
      if (!storageLoaded.current || !scopeRef.current) return false;
      persistDrafts(draftsRef.current, scopeRef.current);
      await storageWriteQueue.current;
      return storageHealthy.current;
    });
    return () => switchGuardRef.current?.(null);
  }, [persistDrafts]);
  const replaceDrafts = useCallback((next: Record<string, Draft>) => {
    draftsRef.current = next;
    setDrafts(next);
    dirtyRef.current(Object.keys(next).length > 0);
  }, []);
  const retryDraftRecovery = useCallback(async () => {
    if (retryingDraftStorage) return;
    setRetryingDraftStorage(true);
    try {
      if (!await loadSnapshots()) return;
      const scope = scopeRef.current;
      if (!scope) return;
      const { snapshot, entries } = restoreMatchingBuildDraft(snapshotsRef.current, scope, draftsRef.current);
      replaceDrafts(entries);
      if (snapshot) {
        setPendingReview(null);
        setReviewExpanded(false);
      } else {
        setPendingReview(snapshotsRef.current.find((saved) => Object.keys(saved.entries).length > 0) ?? null);
        setReviewExpanded(false);
      }
      persistDrafts(entries, scope);
      setNotice({ tone: 'ok', text: snapshot
        ? 'Saved draft recovered. Your current entries were kept.'
        : 'Saved drafts are readable again. Your current entries were kept.' });
    } finally {
      setRetryingDraftStorage(false);
    }
  }, [loadSnapshots, persistDrafts, replaceDrafts, retryingDraftStorage]);
  const apply = useCallback(async (next: BuildPublicWorkout, isCurrent: () => boolean = () => true) => {
    const scope: DraftScope = {
      assignmentId: next.assignment?.id ?? 'none',
      structureVersion: next.program?.structureVersion ?? -1,
      pinRequired,
    };
    const nextScopeKey = buildDraftScopeKey(scope);
    if (initializedScope.current !== nextScopeKey) {
      const previousScope = scopeRef.current;
      if (previousScope) {
        const previousEntries = draftsRef.current;
        if (Object.keys(previousEntries).length) persistDrafts(previousEntries, previousScope);
        replaceDrafts({});
      }
      const loaded = await loadSnapshots();
      if (!isCurrent()) return;
      scopeRef.current = scope;
      initializedScope.current = nextScopeKey;
      if (loaded) {
        const exact = matchingBuildDraft(snapshotsRef.current, scope);
        if (exact) {
          replaceDrafts(exact.entries);
          setPendingReview(null);
          setReviewExpanded(false);
        } else {
          const previous = snapshotsRef.current.find((snapshot) => Object.keys(snapshot.entries).length > 0) ?? null;
          setPendingReview(previous);
          setReviewExpanded(false);
        }
      }
      setWeekIdx(Math.max(0, next.currentWeek));
      setDayIdx(Math.max(0, next.currentDay));
    }
    if (!isCurrent()) return;
    workoutRef.current = next;
    setWorkout(next);
  }, [loadSnapshots, persistDrafts, pinRequired, replaceDrafts]);

  const load = useCallback(async () => {
    if (savingRef.current) return;
    const epoch = ++requestEpoch.current;
    try {
      const next = await fetchRef.current({ athleteId, data: { accessToken } });
      if (epoch !== requestEpoch.current) return;
      await apply(next, () => epoch === requestEpoch.current);
      if (epoch !== requestEpoch.current) return;
      setRefreshError(''); setLoadError('');
    }
    catch (e) {
      if (epoch !== requestEpoch.current) return;
      if (isAuthError(e)) { unauthRef.current(); return; }
      setWorkout((w) => { if (w) setRefreshError(errText(e)); else setLoadError(errText(e)); return w; });
    }
  }, [athleteId, accessToken, apply]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 10_000); return () => { clearInterval(t); ++requestEpoch.current; }; }, [load]);
  useEffect(() => {
    if (pinPolicyRef.current === pinRequired) return;
    pinPolicyRef.current = pinRequired;
    unauthRef.current();
  }, [pinRequired]);

  const program = workout?.program ?? null;
  const assignment = workout?.assignment ?? null;
  const weeks = program?.weeks ?? [];
  const week = weeks[Math.min(weekIdx, Math.max(0, weeks.length - 1))];
  const day = week?.days[Math.min(dayIdx, Math.max(0, (week?.days.length ?? 1) - 1))];
  const media = useMemo(() => {
    const list = workout?.exercises ?? [];
    return new Map(list.map((m) => [m.id, m]));
  }, [workout]);
  const logIndex = useMemo(() => {
    const map = new Map<string, BuildWorkoutLog>();
    (workout?.logs ?? []).forEach((l) => map.set(k(l.assignmentId, l.dayId, l.workoutExerciseId, l.setNumber), l));
    return map;
  }, [workout?.logs]);

  const intensity = workout?.intensity;
  const prefs: BuildIntensityPreferences = intensity?.preferences ?? defaultPreferences();
  const chart = intensity?.chart ?? DEFAULT_RPE_CHART;
  const scale = prefs.effortScale;
  const profileFor = (item: ProgramBuilderWorkoutExercise) => intensity?.profiles.find((p) => p.exerciseId === item.exerciseId);
  /** Live prescription for upcoming sets only, using the athlete's current 1RM. */
  const prescriptionFor = (item: ProgramBuilderWorkoutExercise, n: number): Prescription | null => {
    try { return prescribeIntensity(item, n, profileFor(item), prefs, chart); } catch { return null; }
  };
  const valueFor = (item: ProgramBuilderWorkoutExercise, n: number): Draft => {
    if (!assignment || !day) return { weight: '', reps: '', notes: '', completed: false };
    const key = k(assignment.id, day.id, item.id, n);
    const l = logIndex.get(key);
    const d = drafts[key];
    if (d) {
      // Typed values always win; only untouched auto-filled fields follow the latest target.
      if (l || !d.auto?.length) return d;
      const fresh = autoFill(item, n);
      return { ...d, ...(d.auto.includes('weight') ? { weight: fresh.weight, unit: prefs.unit } : {}), ...(d.auto.includes('reps') ? { reps: fresh.reps } : {}) };
    }
    if (l) {
      const snap = l.intensity;
      return {
        weight: l.weight != null ? String(l.weight) : '', reps: l.reps != null ? String(l.reps) : '', notes: l.notes ?? '', completed: !!l.completed,
        rpe: snap?.actualRpe != null ? String(snap.actualRpe) : snap?.actualRir != null ? String(10 - snap.actualRir) : '',
        rir: snap?.actualRir != null ? String(snap.actualRir) : snap?.actualRpe != null ? String(10 - snap.actualRpe) : '',
        unit: snap?.unit ?? prefs.unit,
      };
    }
    return autoFill(item, n);
  };
  /** Upcoming set: auto-fill the target load and reps (editable). */
  const autoFill = (item: ProgramBuilderWorkoutExercise, n: number): Draft => {
    const rx = prescriptionFor(item, n);
    const repsRx = item.setValues.find((sv) => sv.setNumber === n && sv.property === 'reps')?.value ?? '';
    return {
      weight: rx?.load != null ? String(rx.load) : '', reps: /^\d+$/.test(repsRx.trim()) ? repsRx.trim() : '', notes: '', completed: false,
      rpe: '', rir: '', unit: prefs.unit, auto: ['weight', 'reps'],
    };
  };
  const edit = (item: ProgramBuilderWorkoutExercise, n: number, patch: Partial<Draft>) => {
    if (!assignment || !day || savingRef.current) return;
    const key = k(assignment.id, day.id, item.id, n);
    const current = draftsRef.current[key] ?? valueFor(item, n);
    const auto = (current.auto ?? []).filter((f) => !(f in patch));
    const merged: Draft = { ...current, unit: current.unit ?? prefs.unit, ...patch };
    if (auto.length) merged.auto = auto; else delete merged.auto;
    const next = { ...draftsRef.current, [key]: merged };
    replaceDrafts(next);
    persistDrafts(next, scopeRef.current);
  };
  const toNum = (v: string, max: number, label: string) => {
    const t = v.trim(); if (!t) return null;
    const n = Number(t); if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${label} must be between 0 and ${max}.`);
    return label === 'Reps' ? Math.round(n) : n;
  };
  const save = async (items: ProgramBuilderWorkoutExercise[], markComplete: boolean, label: string) => {
    if (!assignment || !program || !day) return;
    const assignmentId = assignment.id; const dayId = day.id;
    let logs: BuildSetLogInput[];
    try {
      logs = items.flatMap((item) => Array.from({ length: item.sets }, (_, i) => {
        const v = valueFor(item, i + 1);
        const rpe = v.rpe ? Number(v.rpe) : null;
        const rirTyped = v.rir ? Number(v.rir) : null;
        const effRpe = rpe != null && Number.isFinite(rpe) ? rpe : rirTyped != null && Number.isFinite(rirTyped) ? 10 - rirTyped : null;
        // Always send both or neither, derived from one value so they agree.
        const rir = effRpe != null ? 10 - effRpe : null;
        return {
          workoutExerciseId: item.id, setNumber: i + 1, weight: toNum(v.weight, 5000, 'Weight'), reps: toNum(v.reps, 10000, 'Reps'), notes: v.notes.slice(0, 1000), completed: markComplete ? true : v.completed,
          actualRpe: effRpe, actualRir: rir, unit: v.unit ?? prefs.unit,
        };
      }));
    } catch (e) { setNotice({ tone: 'err', text: errText(e) }); return; }
    if (!logs.length) return;
    savingRef.current = true; requestEpoch.current++;
    setBusy(label); setNotice(null);
    try {
      const result = await saveWithDraftRecovery(
        () => saveLogs.mutateAsync({ athleteId, data: { accessToken, assignmentId, structureVersion: program.structureVersion, dayId, logs } }),
        () => {
          const ids = new Set(items.map((i) => i.id));
          const remaining = removeSavedBuildDraftEntries(draftsRef.current, assignmentId, dayId, ids);
          replaceDrafts(remaining);
          persistDrafts(remaining, scopeRef.current);
        },
      );
      if (!result.ok) {
        if (isAuthError(result.error)) { unauthRef.current(); return; }
        setNotice({ tone: 'err', text: `${errText(result.error)} Your entries are still here.` });
        return;
      }
      await apply(result.value);
      setNotice({ tone: 'ok', text: markComplete ? (label === 'workout' ? 'Workout marked complete.' : 'Exercise marked complete.') : 'Saved.' });
    } catch (e) {
      if (isAuthError(e)) { unauthRef.current(); return; }
      setNotice({ tone: 'err', text: `${errText(e)} Your entries are still here.` });
    } finally { savingRef.current = false; setBusy(''); }
  };
  const patchIntensity = (next: BuildIntensityState) => {
    const current = workoutRef.current; if (!current) return;
    const updated = { ...current, intensity: next };
    workoutRef.current = updated; setWorkout(updated);
  };
  const savePreferences = async (next: BuildIntensityPreferences, closeSheet: boolean) => {
    const previous = workoutRef.current?.intensity;
    if (previous) patchIntensity({ ...previous, preferences: next });
    setSettingsError('');
    try {
      const result = await updateIntensity.mutateAsync({ athleteId, data: { accessToken, preferences: next } });
      patchIntensity(result);
      if (closeSheet) { setSettingsOpen(false); setNotice({ tone: 'ok', text: 'Intensity settings saved.' }); }
    } catch (e) {
      if (previous) patchIntensity(previous);
      if (isAuthError(e)) { unauthRef.current(); return; }
      if (closeSheet) setSettingsError(errText(e)); else setNotice({ tone: 'err', text: `${errText(e)} Effort scale was not changed.` });
    }
  };
  const toggleScale = () => void savePreferences({ ...prefs, effortScale: scale === 'rpe' ? 'rir' : 'rpe' }, false);
  const estimateFrom = async (item: ProgramBuilderWorkoutExercise, log: BuildWorkoutLog) => {
    if (!log.intensity?.unit) {
      setNotice({ tone: 'err', text: 'This older set has no recorded unit. Review and save it with kg or lb before estimating a 1RM.' });
      return;
    }
    const profile = profileFor(item);
    const reps = log.reps ?? 0;
    const hasEffort = log.intensity?.actualRpe != null || log.intensity?.actualRir != null;
    const notes = [
      reps > 10 ? `This set has ${reps} reps. Estimates above 10 reps are less reliable.` : '',
      !hasEffort ? 'No effort was logged, so it will be treated as an all-out set (RPE 10).' : '',
    ].filter(Boolean).join(' ');
    let confirmTested = false;
    if (profile?.source === 'tested') {
      confirmTested = await confirmAsync('Replace your tested 1RM?', `${item.exerciseName} has a tested 1RM of ${profile.value} ${profile.unit}. Replace it with an estimate from this set? ${notes}`.trim(), 'Replace');
      if (!confirmTested) return;
    } else if (notes && !await confirmAsync('Estimate 1RM from this set?', notes, 'Estimate')) return;
    setEstimating(log.id); setNotice(null);
    try {
      let result: BuildIntensityState;
      try { result = await updateIntensity.mutateAsync({ athleteId, data: { accessToken, estimateLogId: log.id, ...(confirmTested ? { confirmTestedOverwrite: true } : {}) } }); }
      catch (e) {
        if (statusOf(e) !== 409) throw e;
        if (!await confirmAsync('Replace your tested 1RM?', 'Your coach recorded a tested 1RM for this lift. Replace it with this estimate?', 'Replace')) return;
        result = await updateIntensity.mutateAsync({ athleteId, data: { accessToken, estimateLogId: log.id, confirmTestedOverwrite: true } });
      }
      patchIntensity(result);
      const updated = result.profiles.find((p) => p.exerciseId === item.exerciseId);
      setNotice({ tone: 'ok', text: updated ? `Estimated 1RM for ${item.exerciseName}: ${updated.value} ${updated.unit}. Upcoming targets updated.` : 'Estimated 1RM saved.' });
    } catch (e) {
      if (isAuthError(e)) { unauthRef.current(); return; }
      setNotice({ tone: 'err', text: errText(e) });
    } finally { setEstimating(''); }
  };
  const discardReviewedDraft = () => {
    if (!pendingReview || !reviewExpanded) return;
    const removeKey = snapshotKey(pendingReview);
    storeSnapshots(snapshotsRef.current.filter((snapshot) => snapshotKey(snapshot) !== removeKey));
    setPendingReview(null);
    setReviewExpanded(false);
    setNotice({ tone: 'ok', text: 'The reviewed old draft was discarded. New entries will be saved for the current program.' });
  };
  const openVideo = async (item: ProgramBuilderWorkoutExercise) => {
    const m = media.get(item.exerciseId);
    try {
      if (m?.videoUrl) { await Linking.openURL(m.videoUrl); return; }
      if (m?.hasUploadedVideo) { const r = await stream.mutateAsync({ athleteId, exerciseId: item.exerciseId, data: { accessToken } }); await Linking.openURL(r.url); }
    } catch (e) { if (isAuthError(e)) unauthRef.current(); else setNotice({ tone: 'err', text: 'Video could not open. Try again.' }); }
  };

  if (!workout) return loadError ? <ErrorBox message={loadError} onRetry={() => { setLoadError(''); void load(); }} />
    : <View><Skeleton h={110} /><Skeleton h={50} /><Skeleton h={180} /><Skeleton h={180} /></View>;

  const overall = Math.round(workout.progress.overallPercent);
  const weekly = workout.progress.weeklyPercent;

  return <View>
    {refreshError ? <Pressable testID="build-refresh-retry" accessibilityRole="button" onPress={() => void load()} style={[st.banner, { borderColor: c.destructive }]}>
      <Icon name="refresh-cw" size={14} color={c.destructive} /><Text style={[st.bannerText, { color: c.foreground }]}>Could not refresh. Your entries are safe. Tap to retry.</Text>
    </Pressable> : null}
    {draftStorageUnreadable ? <Pressable testID="build-draft-recovery-retry" accessibilityRole="button"
      accessibilityState={{ disabled: retryingDraftStorage }} disabled={retryingDraftStorage}
      onPress={() => void retryDraftRecovery()} style={[st.banner, { borderColor: c.destructive }]}>
      <Icon name="refresh-cw" size={14} color={c.destructive} />
      <Text style={[st.bannerText, { color: c.foreground }]}>
        {retryingDraftStorage ? 'Checking saved drafts…' : 'Saved drafts could not be read. Your current entries are only on this page. Tap to retry.'}
      </Text>
    </Pressable> : null}

    <View style={[st.hero, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[st.kicker, { color: c.accent }]}>{assignment ? `STARTED ${fmtDate(assignment.startDate).toUpperCase()} · TODAY ${fmtDate(workout.today).toUpperCase()}` : 'NO PROGRAM YET'}</Text>
      <Text style={[st.heroTitle, { color: c.foreground }]} numberOfLines={2}>{program?.name ?? 'Waiting on your coach'}</Text>
      {assignment?.note ? <View style={[st.note, { borderLeftColor: c.primary }]}><Text style={[st.noteText, { color: c.foreground }]}>{assignment.note}</Text></View> : null}
      {program ? <>
        <View style={st.progHead}><Label>Program progress</Label><Text style={[st.pct, { color: c.primary }]}>{overall}%</Text></View>
        <View style={[st.bar, { backgroundColor: c.muted }]}><View style={[st.barFill, { width: `${Math.min(100, overall)}%`, backgroundColor: c.primary }]} /></View>
      </> : null}
    </View>

    <View style={[st.seg, { borderColor: c.border, backgroundColor: c.card }]}>
      {(['today', 'history'] as const).map((v) => <Pressable key={v} testID={`build-view-${v}`} accessibilityRole="tab" accessibilityState={{ selected: view === v }} onPress={() => setView(v)}
        style={[st.segBtn, view === v && { backgroundColor: c.primary }]}>
        <Text style={[st.segText, { color: view === v ? c.primaryForeground : c.mutedForeground }]}>{v === 'today' ? 'Workout' : 'History & PRs'}</Text>
      </Pressable>)}
    </View>

    <View style={st.intensityBar}>
      <GuideLink testID="intensity-guide-logging" />
      <View style={{ flex: 1 }} />
      <Pressable testID="build-intensity-settings" accessibilityRole="button" accessibilityLabel="My intensity settings" onPress={() => { setSettingsError(''); setSettingsOpen(true); }}
        style={[st.settingsBtn, { borderColor: c.border }]}>
        <Icon name="grid" size={13} color={c.foreground} />
        <Text style={[st.settingsText, { color: c.foreground }]}>{`${prefs.unit} · ${scale.toUpperCase()}`}</Text>
      </Pressable>
    </View>
    <AthleteIntensitySheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} preferences={prefs} saving={updateIntensity.isPending}
      error={settingsError} onSave={(next) => void savePreferences(next, true)} />
    {notice ? <Text accessibilityRole="alert" style={[st.notice, { color: notice.tone === 'ok' ? c.primary : c.destructive }]}>{notice.text}</Text> : null}

    {pendingReview ? <Card style={st.reviewCard}>
      <Text style={[st.exName, { color: c.foreground }]}>Saved draft needs review</Text>
      <Body muted>
        {pendingReview.pinRequired !== pinRequired
          ? 'The PIN or access policy changed since these entries were saved. They have not been loaded into this workout.'
          : pendingReview.assignmentId !== (assignment?.id ?? 'none')
            ? 'Your coach changed the assignment. These entries are still saved for the earlier assignment and have not been applied.'
            : 'Your coach changed the workout structure. These entries have not been applied to the updated program.'}
      </Body>
      {reviewExpanded ? Object.entries(pendingReview.entries).map(([key, entry]) => {
        const [, , , setNumber] = key.split('|');
        const label = pendingReview.labels[key];
        return <View key={key} style={[st.reviewEntry, { borderTopColor: c.border }]}>
          <Text style={[st.reviewHeading, { color: c.foreground }]}>
            {label ? `${label.weekName} · ${label.dayName} · ${label.exerciseName}` : 'Previous program entry'} · Set {setNumber}
          </Text>
          <Text style={[st.reviewText, { color: c.mutedForeground }]}>
            {`Weight ${entry.weight || '—'}${entry.unit ? ` ${entry.unit}` : ''} · Reps ${entry.reps || '—'}${entry.rpe ? ` · RPE ${entry.rpe}` : ''}${entry.rir ? ` · RIR ${entry.rir}` : ''}${entry.completed ? ' · Complete' : ''}`}
          </Text>
          {entry.notes ? <Text style={[st.reviewText, { color: c.mutedForeground }]}>{entry.notes}</Text> : null}
        </View>;
      }) : <Body muted>{Object.keys(pendingReview.entries).length} unfinished set{Object.keys(pendingReview.entries).length === 1 ? '' : 's'} · saved {fmtDate(pendingReview.updatedAt || new Date().toISOString())}</Body>}
      <Btn
        label={reviewExpanded ? 'Hide draft details' : 'Review saved draft'}
        kind="ghost"
        onPress={() => setReviewExpanded((expanded) => !expanded)}
        testID="build-review-old-draft"
      />
      {reviewExpanded ? <Btn label="Discard reviewed draft" kind="ghost" onPress={discardReviewedDraft} testID="build-discard-old-draft" /> : null}
    </Card> : null}

    {view === 'history' ? <History workout={workout} /> : !program || !assignment ? <Empty title="No program assigned yet." copy="Check with your coach." /> : <>
      <View style={st.pills}>
        {weeks.map((w, i) => {
          const on = i === weekIdx; const p = Math.round(weekly[i] ?? 0);
          return <Pressable key={w.id} testID={`build-week-${i}`} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { setWeekIdx(i); setDayIdx(0); }}
            style={[st.weekPill, { borderColor: on ? c.primary : c.border, backgroundColor: on ? `${c.primary}1F` : c.card }]}>
            <Text style={[st.pillText, { color: on ? c.primary : c.foreground }]} numberOfLines={1}>{w.name}</Text>
            <Text style={[st.pillSub, { color: c.mutedForeground }]}>{p}%{i === workout.currentWeek ? ' · NOW' : ''}</Text>
          </Pressable>;
        })}
      </View>
      <View style={st.pills}>
        {(week?.days ?? []).map((d, i) => {
          const on = i === dayIdx; const now = weekIdx === workout.currentWeek && i === workout.currentDay;
          return <Pressable key={d.id} testID={`build-day-${i}`} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setDayIdx(i)}
            style={[st.dayPill, { borderColor: on ? c.primary : now ? c.accent : c.border, backgroundColor: on ? c.primary : 'transparent' }]}>
            <Text style={[st.pillText, { color: on ? c.primaryForeground : c.foreground }]} numberOfLines={1}>{d.name}</Text>
          </Pressable>;
        })}
      </View>

      {day ? <>
        {day.workoutName ? <Text style={[st.dayTitle, { color: c.foreground }]}>{day.workoutName}</Text> : null}
        {day.exercises.length ? [...day.exercises].sort((a, b) => a.position - b.position).map((item) => {
          const m = media.get(item.exerciseId);
          const hasVideo = !!(m?.videoUrl || m?.hasUploadedVideo);
          const allDone = Array.from({ length: item.sets }, (_, i) => workout.logs.some((l) =>
            l.assignmentId === assignment.id && l.dayId === day.id && l.workoutExerciseId === item.id && l.setNumber === i + 1 && l.completed)).every(Boolean);
          const itemDirty = Object.keys(drafts).some((key) => key.startsWith(`${assignment.id}|${day.id}|${item.id}|`));
          return <Card key={item.id} style={{ borderLeftWidth: 3, borderLeftColor: allDone ? c.primary : c.border }}>
            <View style={st.exHead}>
              {item.supersetLetter ? <View style={[st.letter, { backgroundColor: c.accent }]}><Text style={[st.letterText, { color: c.background }]}>{item.supersetLetter}{item.supersetIndex ?? ''}</Text></View> : null}
              <Text style={[st.exName, { color: c.foreground }]}>{item.exerciseName}</Text>
              {allDone ? <Icon name="check-circle" size={18} color={c.primary} /> : null}
            </View>
            {m?.description ? <Body muted style={{ marginBottom: 6 }}>{m.description}</Body> : null}
            {item.additionalInfo ? <Body style={{ marginBottom: 6 }}>{item.additionalInfo}</Body> : null}
            {hasVideo ? <Pressable testID={`build-video-${item.id}`} accessibilityRole="link" onPress={() => void openVideo(item)} style={st.videoLink}>
              <Icon name="external-link" size={13} color={c.primary} /><Text style={[st.videoText, { color: c.primary }]}>Watch demo</Text>
            </Pressable> : null}
            {Array.from({ length: item.sets }, (_, i) => {
              const n = i + 1; const v = valueFor(item, n);
              const log = logIndex.get(k(assignment.id, day.id, item.id, n));
              const p = log ? null : prescriptionFor(item, n);
              const intensityLine = log?.intensity ? snapshotText(log.intensity, scale) : p ? prescriptionText(p, scale) : '';
              const other = item.setValues.filter((sv) => sv.setNumber === n && (intensityLine ? !['percent', 'rpe', 'rir', 'weight'].includes(sv.property) : true))
                .map((sv) => `${PROP_LABEL[sv.property] ?? sv.property} ${sv.value}`).join(' · ');
              const rx = [intensityLine, other].filter(Boolean).join(' · ');
              const hasEffortTarget = !!(p?.rpe || p?.rir || log?.intensity?.targetRpeMax != null || log?.intensity?.targetRirMin != null);
              const unit = v.unit ?? prefs.unit;
              const canEstimate = !!log?.intensity?.unit && log.completed && (log.weight ?? 0) > 0 && (log.reps ?? 0) >= 1 && !(drafts[k(assignment.id, day.id, item.id, n)]);
              return <View key={n} style={[st.set, { borderTopColor: c.border }]}>
                <View style={st.setHead}>
                  <Text style={[st.setNo, { color: c.mutedForeground }]}>SET {n}</Text>
                  <Text style={[st.rx, { color: c.foreground }]} numberOfLines={2}>{rx || 'As prescribed'}</Text>
                  <Pressable testID={`build-set-done-${item.id}-${n}`} accessibilityRole="checkbox" accessibilityState={{ checked: v.completed }} accessibilityLabel={`Set ${n} done`}
                    onPress={() => edit(item, n, { completed: !v.completed })} style={[st.check, { borderColor: v.completed ? c.primary : c.border, backgroundColor: v.completed ? c.primary : 'transparent' }]}>
                    {v.completed ? <Icon name="check" size={14} color={c.primaryForeground} /> : null}
                  </Pressable>
                </View>
                <View style={st.inputs}>
                  <SmallInput label={`Weight (${unit})`} value={v.weight} onChange={(t) => edit(item, n, { weight: t })} numeric testID={`build-weight-${item.id}-${n}`} />
                  <SmallInput label="Reps" value={v.reps} onChange={(t) => edit(item, n, { reps: t })} numeric testID={`build-reps-${item.id}-${n}`} />
                </View>
                {p?.missingOneRepMax ? <MissingOneRepMaxNote name={item.exerciseName} /> : null}
                <EffortPicker scale={scale} rpe={v.rpe ?? ''} onChange={(pair) => edit(item, n, pair)} onToggleScale={toggleScale}
                  testID={`build-effort-${item.id}-${n}`} cap={hasEffortTarget ? (p ? effortCap(p) : log?.intensity?.targetRpeMax ?? (log?.intensity?.targetRirMin != null ? 10 - log.intensity.targetRirMin : null)) : null} />
                {drafts[k(assignment.id, day.id, item.id, n)] || !log ? <LiveSetFeedback p={p ?? prescriptionFor(item, n)} weight={v.weight} unit={unit} rpe={v.rpe ?? ''} />
                  : <SavedSetFeedback log={log} scale={scale} />}
                <SmallInput label="Notes" value={v.notes} onChange={(t) => edit(item, n, { notes: t })} testID={`build-notes-${item.id}-${n}`} />
                {canEstimate && log ? <Pressable testID={`build-estimate-${item.id}-${n}`} accessibilityRole="button" disabled={!!estimating}
                  accessibilityState={{ disabled: !!estimating, busy: estimating === log.id }} onPress={() => void estimateFrom(item, log)} style={st.estimate}>
                  <Icon name="arrow-up-right" size={13} color={c.accent} />
                  <Text style={[st.estimateText, { color: c.accent }]}>{estimating === log.id ? 'Estimating…' : 'Use this set to estimate my 1RM'}</Text>
                  {(log.reps ?? 0) > 10 ? <Text style={[st.estimateWarn, { color: c.warning }]}>less reliable above 10 reps</Text> : null}
                </Pressable> : null}
              </View>;
            })}
            <View style={st.exActions}>
              <Btn label={itemDirty ? 'Save' : 'Saved'} kind="ghost" icon="check" disabled={!itemDirty || !!busy} loading={busy === `save-${item.id}`} onPress={() => void save([item], false, `save-${item.id}`)} testID={`build-save-${item.id}`} />
              <Btn label="Mark exercise complete" disabled={!!busy} loading={busy === `done-${item.id}`} onPress={() => void save([item], true, `done-${item.id}`)} testID={`build-complete-${item.id}`} />
            </View>
          </Card>;
        }) : <Empty title="Rest day" copy="Nothing programmed for this day." />}
        {day.exercises.length ? <Btn label="Mark workout complete" icon="check-circle" disabled={!!busy} loading={busy === 'workout'} onPress={() => void save(day.exercises, true, 'workout')} testID="build-complete-workout" /> : null}
      </> : <Empty title="No days in this week" />}
    </>}
  </View>;
}

function SmallInput({ label, value, onChange, numeric, testID }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; testID: string }) {
  const c = useColors();
  return <View style={{ flex: 1, minWidth: 0, marginTop: 6 }}>
    <Text style={[st.inLabel, { color: c.mutedForeground }]}>{label.toUpperCase()}</Text>
    <TextInput testID={testID} accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'}
      maxLength={numeric ? 8 : 1000} placeholder="—" placeholderTextColor={c.mutedForeground}
      style={[st.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background }]} />
  </View>;
}

function History({ workout }: { workout: BuildPublicWorkout }) {
  const c = useColors();
  const { records, groups } = useMemo(() => buildHistoryViewModel(workout), [workout]);
  return <View>
    <Card>
      <Label>Personal records · from your Build logs</Label>
      {records.length ? records.map((r) => <View key={r.key} style={[st.prRow, { borderBottomColor: c.border }]}>
        <Icon name="award" size={15} color={c.warning} />
        <Text numberOfLines={1} style={[st.prName, { color: c.foreground }]}>{r.exerciseName}</Text>
        <Text style={[st.prVal, { color: c.primary }]}>{r.value}</Text>
      </View>) : <Body muted>Log weights to start setting records.</Body>}
    </Card>
    {groups.length ? groups.map((group) => <Card key={group.assignmentId}>
      <Text style={[st.exName, { color: c.foreground }]}>{group.programName}</Text>
      {group.days.map((day) => <View key={day.dayId} style={[st.histDay, { borderTopColor: c.border }]}>
        <Text style={[st.inLabel, { color: c.mutedForeground }]}>{`${day.weekName} · ${day.dayName} · ${fmtDate(day.latest)}`.toUpperCase()}</Text>
        {day.exercises.map((exercise) => <Text key={exercise.exerciseName} style={[st.histLine, { color: c.foreground }]}>
          {exercise.exerciseName}: <Text style={{ color: c.mutedForeground }}>{exercise.sets.map((set) => set.value).join(', ')}</Text>
          {exercise.sets.filter((set) => set.detail).map((set) => <Text key={set.setNumber} style={[st.histDetail, { color: c.mutedForeground }]}>{`\nSet ${set.setNumber}: ${set.detail}`}</Text>)}
        </Text>)}
      </View>)}
    </Card>) : <Empty title="No history yet" copy="Saved sets show up here." />}
  </View>;
}

const st = StyleSheet.create({
  histDetail: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  intensityBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  settingsBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, minHeight: 32 },
  settingsText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  estimate: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8, minHeight: 32 },
  estimateText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  estimateWarn: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  reviewCard: { borderWidth: 1, marginBottom: 12 },
  reviewEntry: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, marginTop: 7 },
  reviewHeading: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  reviewText: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10 },
  bannerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flex: 1 },
  hero: { borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 12 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3 },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 6, letterSpacing: -0.5 },
  note: { borderLeftWidth: 3, paddingLeft: 10, marginTop: 12 },
  noteText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  progHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 },
  pct: { fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 4 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, marginBottom: 12 },
  segBtn: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  notice: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 10 },
  weekPill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 92, maxWidth: 160 },
  dayPill: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', maxWidth: 160 },
  pillText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  pillSub: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 2 },
  dayTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 10 },
  exHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  letter: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  letterText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  exName: { fontFamily: 'Inter_700Bold', fontSize: 16, flex: 1 },
  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  videoText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  set: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  setNo: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, width: 42 },
  rx: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flex: 1, minWidth: 0 },
  check: { width: 30, height: 30, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  inputs: { flexDirection: 'row', gap: 8 },
  inLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1, marginBottom: 4 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontFamily: 'Inter_500Medium', fontSize: 15, width: '100%' },
  exActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  prName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 },
  prVal: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  histDay: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8 },
  histLine: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 3 },
});
