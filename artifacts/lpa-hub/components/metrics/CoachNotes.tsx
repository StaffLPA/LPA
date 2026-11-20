import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getNextAthleteCoachNotesPage,
  getListAthleteCoachNotesQueryKey,
  useCreateAthleteCoachNote,
  useDeleteAthleteCoachNote,
  useListAthleteCoachNotes,
  useUpdateAthleteCoachNote,
} from '@workspace/api-client-react';
import type { AthleteCoachNote, AthleteCoachNotesPage } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { clearCoachNoteDraft, coachNoteDraftKey, flushCoachNoteDraftWrites, loadCoachNoteDraft, resolveCoachNoteSaveFailure, saveCoachNoteDraft } from '@/lib/coachNoteEdit';
import { useColors } from '@/hooks/useColors';
import { Btn, Card, Confirm, ErrorBox, H, Skeleton } from './ui';

const MAX = 500;
const POLL_MS = 30000;
const POLL_LIMIT = 20;
const TZ = 'America/Phoenix';

function errMsg(e: unknown, fallback: string) {
  const anyE = e as any;
  return anyE?.data?.error || anyE?.data?.message || (anyE instanceof Error ? anyE.message : '') || fallback;
}
function fmtWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return d.toISOString(); }
}
function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}
function Avatar({ name, uri }: { name: string; uri: string | null }) {
  const c = useColors();
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);
  if (uri && !failed) return <Image source={{ uri }} onError={() => setFailed(true)} style={[s.avatar, { borderColor: c.border }]} accessibilityLabel={name} />;
  return <View style={[s.avatar, { borderColor: `${c.primary}66`, backgroundColor: `${c.primary}22` }]}><Text style={[s.initials, { color: c.primary }]}>{initials(name)}</Text></View>;
}

function Counter({ len }: { len: number }) {
  const c = useColors();
  const over = len > MAX;
  return <Text style={[s.counter, { color: over ? c.destructive : len > MAX - 50 ? c.primary : c.mutedForeground }]}>{len}/{MAX}</Text>;
}

function NoteBubble({ note, athleteId, userId, onEditingChange, onNoteUpdated, onDelete }: { note: AthleteCoachNote; athleteId: string; userId: string | null; onEditingChange: (id: string, editing: boolean, note: AthleteCoachNote) => void; onNoteUpdated: (note: AthleteCoachNote) => void; onDelete: (n: AthleteCoachNote) => void }) {
  const c = useColors(); const qc = useQueryClient();
  const draftKey = userId ? coachNoteDraftKey(userId, athleteId, note.id) : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [editVersion, setEditVersion] = useState(note.updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [latestSaved, setLatestSaved] = useState<AthleteCoachNote | null>(null);
  const [saved, setSaved] = useState(false);
  const requestRef = useRef(0);
  const writeRef = useRef(0);
  const update = useUpdateAthleteCoachNote();
  const trimmed = draft.trim();
  const valid = trimmed.length > 0 && draft.length <= MAX;
  const edited = note.updatedAt !== note.createdAt;
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 2200); return () => clearTimeout(t); }, [saved]);

  useEffect(() => () => { requestRef.current += 1; }, []);

  const restoreDraft = async (request: number) => {
    if (!draftKey) {
      setDraftStorageError('Your signed-in account could not be confirmed. Try again.');
      setDraftLoading(false);
      return;
    }
    setDraftLoading(true);
    setDraftStorageError(null);
    try {
      const stored = await loadCoachNoteDraft(AsyncStorage, draftKey);
      if (requestRef.current !== request) return;
      if (stored && stored.text !== note.text) {
        setDraft(stored.text);
        setEditVersion(stored.updatedAt);
      } else {
        setDraft(note.text);
        setEditVersion(note.updatedAt);
        if (stored) {
          try { await clearCoachNoteDraft(AsyncStorage, draftKey); }
          catch { setDraftStorageError('The saved text is already current, but this device could not clear its old copy.'); }
        }
      }
    } catch {
      if (requestRef.current === request) {
        setDraftStorageError('This device could not read the saved draft. Retry recovery before editing.');
      }
    } finally {
      if (requestRef.current === request) setDraftLoading(false);
    }
  };
  const start = () => {
    const request = ++requestRef.current;
    setDraft(note.text);
    setEditVersion(note.updatedAt);
    setLatestSaved(null);
    setError(null);
    setEditing(true);
    onEditingChange(note.id, true, note);
    void restoreDraft(request);
  };
  const cancel = async () => {
    if (!draftKey || cancelPending) return;
    const request = ++requestRef.current;
    setCancelPending(true);
    setDraftStorageError(null);
    try {
      await clearCoachNoteDraft(AsyncStorage, draftKey);
      if (requestRef.current !== request) return;
      setEditing(false);
      setError(null);
      setLatestSaved(null);
      onEditingChange(note.id, false, note);
    } catch {
      if (requestRef.current === request) setDraftStorageError('This device could not clear the saved draft. Tap Cancel to retry.');
    } finally {
      if (requestRef.current === request) setCancelPending(false);
    }
  };
  const changeDraft = (text: string) => {
    setDraft(text);
    setError(null);
    if (!draftKey) return;
    const write = ++writeRef.current;
    const operation = text === note.text
      ? clearCoachNoteDraft(AsyncStorage, draftKey)
      : saveCoachNoteDraft(AsyncStorage, draftKey, { text, updatedAt: editVersion });
    void operation.then(() => {
      if (writeRef.current === write) setDraftStorageError(null);
    }).catch(() => {
      if (writeRef.current === write) setDraftStorageError('This device could not save your draft. Keep this screen open and try again.');
    });
  };
  const save = () => {
    if (!valid || update.isPending || !draftKey) return;
    setError(null);
    update.mutate({ athleteId, noteId: note.id, data: { text: trimmed, updatedAt: editVersion } }, {
      onSuccess: async (n) => {
        await qc.cancelQueries({ queryKey: getListAthleteCoachNotesQueryKey(athleteId) });
        onNoteUpdated(n);
        try {
          await clearCoachNoteDraft(AsyncStorage, draftKey);
          setDraftStorageError(null);
          setEditing(false); setLatestSaved(null); setSaved(true); onEditingChange(note.id, false, n);
        } catch {
          setEditVersion(n.updatedAt);
          setDraftStorageError('The note was saved, but this device could not clear its draft. Tap Cancel to retry clearing it.');
        }
        void qc.invalidateQueries({ queryKey: getListAthleteCoachNotesQueryKey(athleteId) });
      },
      onError: async (e) => {
        const failure = resolveCoachNoteSaveFailure(e, note.id, draft);
        setDraft(failure.draft);
        if (failure.kind === 'conflict') {
          const { latest } = failure;
          await qc.cancelQueries({ queryKey: getListAthleteCoachNotesQueryKey(athleteId) });
          onNoteUpdated(latest);
          setLatestSaved(latest);
          setEditVersion(latest.updatedAt);
          try {
            await saveCoachNoteDraft(AsyncStorage, draftKey, { text: failure.draft, updatedAt: latest.updatedAt });
            setDraftStorageError(null);
          } catch {
            setDraftStorageError('This device could not update the saved draft version. Keep this screen open and try again.');
          }
          setError(failure.message);
          return;
        }
        setError(failure.message);
      },
    });
  };
  const toggleHidden = () => {
    if (update.isPending || !note.canHide) return;
    setError(null);
    update.mutate({ athleteId, noteId: note.id, data: { text: note.text, updatedAt: note.updatedAt, hidden: !note.hidden } }, {
      onSuccess: onNoteUpdated,
      onError: (e) => setError(errMsg(e, 'The note visibility could not be changed.')),
    });
  };

  return <View testID={`coach-note-${note.id}`} style={s.row}>
    <Avatar name={note.authorName} uri={note.authorPhotoUri} />
    <View style={[s.bubble, { backgroundColor: c.background, borderColor: editing ? c.primary : c.border }]}>
      <View style={s.meta}>
        <Text numberOfLines={1} style={[s.author, { color: c.foreground }]}>{note.authorName}</Text>
        <Text style={[s.when, { color: c.mutedForeground }]}>{fmtWhen(note.createdAt)}{edited ? ' · edited' : ''}</Text>
      </View>
      {editing ? <>
        <TextInput testID={`coach-note-edit-input-${note.id}`} accessibilityLabel="Edit coach note" value={draft} onChangeText={changeDraft} editable={!update.isPending && !draftLoading && !draftStorageError} multiline maxLength={MAX} autoFocus placeholderTextColor={c.mutedForeground}
          style={[s.input, { color: c.foreground, borderColor: draft.length > MAX ? c.destructive : c.border, backgroundColor: c.card }]} />
        <View style={s.actions}>
          <Btn label="Save" icon="check" disabled={!valid || !!draftStorageError || draftLoading || !draftKey} loading={update.isPending} onPress={save} testID={`coach-note-save-${note.id}`} />
          <Btn label="Cancel" kind="ghost" disabled={update.isPending || cancelPending || !draftKey} loading={cancelPending} onPress={() => void cancel()} />
          <View style={{ flex: 1 }} />
          <Counter len={draft.length} />
        </View>
        {draftLoading ? <Text style={[s.err, { color: c.mutedForeground }]}>Checking this device for an unfinished draft…</Text> : null}
        {draftStorageError ? <Text style={[s.err, { color: c.destructive }]}>{draftStorageError}
          {draftStorageError.includes('Retry recovery') ? <Text accessibilityRole="button" onPress={() => void restoreDraft(requestRef.current)}> Retry draft recovery.</Text> : null}
          {draftStorageError.includes('could not save your draft') || draftStorageError.includes('could not update the saved draft version') ? <Text accessibilityRole="button" onPress={() => changeDraft(draft)}> Retry saving draft.</Text> : null}
        </Text> : null}
        {error ? <Text style={[s.err, { color: c.destructive }]}>{error}</Text> : null}
        {latestSaved ? <View style={[s.latestSaved, { borderColor: c.border, backgroundColor: c.card }]}>
          <Text style={[s.latestLabel, { color: c.mutedForeground }]}>Latest saved text</Text>
          <Text selectable style={[s.text, { color: c.foreground }]}>{latestSaved.text}</Text>
          <Text style={[s.err, { color: c.mutedForeground }]}>Your draft remains above. Review both versions before saving again.</Text>
        </View> : null}
      </> : <>
        <Text selectable style={[s.text, { color: c.foreground }]}>{note.text}</Text>
        {note.canHide && note.hidden ? <Text style={[s.when, { color: c.mutedForeground, marginTop: 5 }]}>Hidden from athlete and family</Text> : null}
        {error ? <Text style={[s.err, { color: c.destructive }]}>{error}</Text> : null}
        {(note.canEdit || note.canDelete || note.canHide || saved) ? <View style={s.links}>
          {note.canEdit ? <Text testID={`coach-note-edit-${note.id}`} accessibilityRole="button" onPress={start} style={[s.link, { color: c.primary }]}>Edit</Text> : null}
          {note.canHide ? <Text testID={`coach-note-hide-${note.id}`} accessibilityRole="button" onPress={toggleHidden} style={[s.link, { color: c.primary }]}>{note.hidden ? 'Show' : 'Hide'}</Text> : null}
          {note.canDelete ? <Text testID={`coach-note-delete-${note.id}`} accessibilityRole="button" onPress={() => onDelete(note)} style={[s.link, { color: c.destructive }]}>Delete</Text> : null}
          <View style={{ flex: 1 }} />
          {saved ? <Text style={[s.ok, { color: c.primary }]}>Saved</Text> : null}
        </View> : null}
      </>}
    </View>
  </View>;
}

export function CoachNotes({ athleteId, canManage = true }: { athleteId: string; canManage?: boolean }) {
  const c = useColors(); const qc = useQueryClient();
  const { user } = useApp();
  const key = getListAthleteCoachNotesQueryKey(athleteId);
  const [polls, setPolls] = useState(0);
  const q = useListAthleteCoachNotes(athleteId, { query: { queryKey: key, enabled: !!athleteId, refetchInterval: polls < POLL_LIMIT ? POLL_MS : false } });
  useEffect(() => { if (q.dataUpdatedAt) setPolls((n) => n + 1); }, [q.dataUpdatedAt]);
  const refetchRef = useRef(q.refetch); refetchRef.current = q.refetch;
  useFocusEffect(React.useCallback(() => { setPolls(0); void refetchRef.current(); }, []));
  useEffect(() => { const sub = AppState.addEventListener('change', (st) => { if (st === 'active') { setPolls(0); void refetchRef.current(); } else if (st === 'background' || st === 'inactive') { void flushCoachNoteDraftWrites(); } }); return () => sub.remove(); }, []);

  const [draft, setDraft] = useState('');
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  const loadingAllRef = useRef(false);
  const [extraPages, setExtraPages] = useState<AthleteCoachNotesPage[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState<Map<string, AthleteCoachNote>>(new Map());
  const [pendingDelete, setPendingDelete] = useState<AthleteCoachNote | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const create = useCreateAthleteCoachNote();
  const del = useDeleteAthleteCoachNote();
  useEffect(() => { if (!posted) return; const t = setTimeout(() => setPosted(false), 2200); return () => clearTimeout(t); }, [posted]);

  const notes = useMemo(() => {
    const loaded = [...(q.data?.notes ?? []), ...extraPages.flatMap((page) => page.notes)];
    const loadedIds = new Set(loaded.map((note) => note.id));
    return [...loaded, ...[...editingNotes.values()].filter((note) => !loadedIds.has(note.id))];
  }, [q.data, extraPages, editingNotes]);
  // Keep an active edit mounted if a new note arrives or the list is collapsed.
  const visible = expanded ? notes : notes.filter((note, index) => index < 3 || editingIds.has(note.id));
  const nextCursor = extraPages.length
    ? extraPages[extraPages.length - 1].nextCursor
    : q.data?.nextCursor ?? null;
  const trimmed = draft.trim();
  const valid = trimmed.length > 0 && draft.length <= MAX;

  const loadAll = async () => {
    if (loadingAllRef.current || !nextCursor) return;
    loadingAllRef.current = true;
    setLoadingAll(true);
    setLoadError(null);
    try {
      let cursor: string | null = nextCursor;
      while (cursor && expandedRef.current) {
        const page = await getNextAthleteCoachNotesPage(athleteId, cursor);
        setExtraPages((previous) => [...previous, page]);
        cursor = page.nextCursor;
      }
    } catch (e) {
      setLoadError(errMsg(e, 'More coach notes could not load.'));
    } finally {
      loadingAllRef.current = false;
      setLoadingAll(false);
    }
  };
  const toggleExpanded = () => {
    if (expanded) {
      expandedRef.current = false;
      setExpanded(false);
      return;
    }
    expandedRef.current = true;
    setExpanded(true);
    void loadAll();
  };
  const updateCachedNote = (updated: AthleteCoachNote) => {
    qc.setQueryData<AthleteCoachNotesPage>(key, (old) => old
      ? { ...old, notes: old.notes.map((note) => note.id === updated.id ? updated : note) }
      : old);
    setExtraPages((previous) => previous.map((page) => ({
      ...page,
      notes: page.notes.map((note) => note.id === updated.id ? updated : note),
    })));
    setEditingNotes((previous) => previous.has(updated.id)
      ? new Map(previous).set(updated.id, updated)
      : previous);
  };

  const post = () => {
    if (!valid || create.isPending) return;
    setPostError(null);
    create.mutate({ athleteId, data: { text: trimmed } }, {
      onSuccess: async (n) => {
        await qc.cancelQueries({ queryKey: key });
        qc.setQueryData<AthleteCoachNotesPage>(key, (old) => old
          ? { ...old, notes: [n, ...old.notes.filter((x) => x.id !== n.id)] }
          : old);
        setExtraPages((previous) => previous.map((page) => ({
          ...page,
          notes: page.notes.filter((x) => x.id !== n.id),
        })));
        setDraft(''); setPosted(true);
        void qc.invalidateQueries({ queryKey: key });
      },
      onError: (e) => setPostError(errMsg(e, 'The note could not be posted.')),
    });
  };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setDeleteError(null);
    del.mutate({ athleteId, noteId: id }, {
      onSuccess: async () => {
        await qc.cancelQueries({ queryKey: key });
        qc.setQueryData<AthleteCoachNotesPage>(key, (old) => old
          ? { ...old, notes: old.notes.filter((x) => x.id !== id) }
          : old);
        setExtraPages((previous) => previous.map((page) => ({
          ...page,
          notes: page.notes.filter((x) => x.id !== id),
        })));
        setPendingDelete(null);
        void qc.invalidateQueries({ queryKey: key });
      },
      onError: (e) => setDeleteError(errMsg(e, 'The note could not be deleted.')),
    });
  };
  const onEditingChange = (id: string, on: boolean, note: AthleteCoachNote) => {
    setEditingIds((previous) => { const next = new Set(previous); if (on) next.add(id); else next.delete(id); return next; });
    setEditingNotes((previous) => {
      const next = new Map(previous);
      if (on) next.set(id, note);
      else next.delete(id);
      return next;
    });
  };

  return <View testID="coach-notes-section">
    <Card>
      <H>Coach Notes</H>
      {canManage ? <>
        <TextInput testID="coach-note-input" accessibilityLabel="Add note" value={draft} onChangeText={(t) => { setDraft(t); if (postError) setPostError(null); }} editable={!create.isPending} multiline maxLength={MAX}
          placeholder="Add a note for the athlete and family" placeholderTextColor={c.mutedForeground}
          style={[s.input, { color: c.foreground, borderColor: draft.length > MAX ? c.destructive : c.border, backgroundColor: c.background }]} />
        <View style={s.actions}>
          <Btn label="Post note" icon="send" disabled={!valid} loading={create.isPending} onPress={post} testID="coach-note-post" />
          {posted ? <Text style={[s.ok, { color: c.primary }]}>Posted</Text> : null}
          <View style={{ flex: 1 }} />
          <Counter len={draft.length} />
        </View>
        {draft.length > 0 && !trimmed ? <Text style={[s.err, { color: c.mutedForeground }]}>A note needs some text.</Text> : null}
        {draft.length > MAX ? <Text style={[s.err, { color: c.destructive }]}>Notes are limited to {MAX} characters.</Text> : null}
        {postError ? <Text style={[s.err, { color: c.destructive }]}>{postError}</Text> : null}
      </> : null}
      <View style={[s.divider, { backgroundColor: c.border }]} />
      {q.isLoading ? <><Skeleton h={58} /><Skeleton h={58} /></>
        : q.isError && !q.data ? <ErrorBox message={errMsg(q.error, 'Coach notes could not load.')} onRetry={() => void q.refetch()} />
        : notes.length === 0 ? <Text style={[s.empty, { color: c.mutedForeground }]}>No coach notes yet.</Text>
        : <>
          {visible.map((n) => <NoteBubble key={`${user?.id ?? 'signed-out'}:${athleteId}:${n.id}`} note={n} athleteId={athleteId} userId={user?.id ?? null} onEditingChange={onEditingChange} onNoteUpdated={updateCachedNote} onDelete={(x) => { setDeleteError(null); setPendingDelete(x); }} />)}
          {(notes.length > 3 || nextCursor) ? <Text testID="coach-notes-toggle" accessibilityRole="button" onPress={toggleExpanded} style={[s.toggle, { color: c.primary }]}>{expanded ? 'Show fewer' : 'Show all'}</Text> : null}
          {expanded && loadingAll ? <Text style={[s.when, { color: c.mutedForeground }]}>Loading all coach notes…</Text> : null}
          {expanded && loadError ? <Text accessibilityRole="button" onPress={() => void loadAll()} style={[s.err, { color: c.destructive }]}>{loadError} Tap to retry.</Text> : null}
        </>}
    </Card>
    <Confirm visible={!!pendingDelete} title="Delete note?" copy={deleteError ? `${deleteError} Try again or cancel.` : 'This coach note will be permanently removed for everyone. Use Hide instead to keep it for staff reference.'}
      confirmLabel="Delete" danger busy={del.isPending} confirmTestID="coach-note-delete-confirm"
      onConfirm={confirmDelete} onCancel={() => { setPendingDelete(null); setDeleteError(null); }} />
  </View>;
}

const s = StyleSheet.create({
  input: { minHeight: 64, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, fontFamily: 'Inter_400Regular', fontSize: 13, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  counter: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  ok: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.4 },
  err: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6 },
  latestSaved: { borderWidth: 1, borderRadius: 9, padding: 9, marginTop: 8 },
  latestLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, marginBottom: 4 },
  divider: { height: 1, marginVertical: 12 },
  empty: { fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 6 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  bubble: { flex: 1, borderWidth: 1, borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 9 },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 },
  author: { fontFamily: 'Inter_700Bold', fontSize: 13, flexShrink: 1 },
  when: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  text: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  links: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  link: { fontFamily: 'Inter_700Bold', fontSize: 12, paddingVertical: 2 },
  toggle: { fontFamily: 'Inter_700Bold', fontSize: 12, alignSelf: 'flex-start', paddingVertical: 4 },
});
