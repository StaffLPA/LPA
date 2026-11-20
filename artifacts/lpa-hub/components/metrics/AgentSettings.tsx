import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getGetMetricsAgentAcademyProfileQueryKey,
  getListMetricsAgentMemoriesQueryKey,
  type MetricsAgentAcademyProfile,
  type MetricsAgentMemory,
  useClearMetricsAgentMemories,
  useConfirmMetricsAgentMemory,
  useDeleteMetricsAgentMemory,
  useGetMetricsAgentAcademyProfile,
  useListMetricsAgentMemories,
  useUpdateMetricsAgentAcademyProfile,
} from '@workspace/api-client-react';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { Btn, Confirm, ErrorBox, Skeleton } from './ui';

type ProfileKey = keyof MetricsAgentAcademyProfile;
const FIELDS: { key: ProfileKey; label: string; max: number; hint: string; multiline?: boolean }[] = [
  { key: 'academyName', label: 'Academy name', max: 100, hint: 'Required. Used in answers and graphics.' },
  { key: 'description', label: 'Description', max: 600, hint: 'What the academy is and who it serves.', multiline: true },
  { key: 'teamsClasses', label: 'Teams and classes', max: 600, hint: 'Team names, grad classes, groupings.', multiline: true },
  { key: 'seasonCalendar', label: 'Season calendar', max: 600, hint: 'Testing windows, seasons, key dates.', multiline: true },
  { key: 'keyMetrics', label: 'Key metrics', max: 600, hint: 'Metrics staff care about most.', multiline: true },
  { key: 'preferredUnits', label: 'Preferred units', max: 300, hint: 'For example mph, lb, seconds.' },
  { key: 'captionTone', label: 'Caption tone', max: 400, hint: 'Voice for social captions.', multiline: true },
  { key: 'hashtags', label: 'Hashtags', max: 300, hint: 'Default hashtags for posts.' },
];

export function errMsg(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const e = error as { data?: { error?: string; message?: string }; message?: string };
    if (e.data?.error) return e.data.error;
    if (e.data?.message) return e.data.message;
    if (e.message) return e.message;
  }
  return fallback;
}

const categoryLabel = (m: MetricsAgentMemory) => m.category === 'coaching_context' ? 'Coaching context' : 'Response preference';

/** Inline chat strip: pending suggestions with explicit Save memory / Dismiss. */
export function MemorySuggestions({ conversationId }: { conversationId: string | null }) {
  const c = useColors();
  const qc = useQueryClient();
  const memories = useListMetricsAgentMemories();
  const confirm = useConfirmMetricsAgentMemory();
  const remove = useDeleteMetricsAgentMemory();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = (memories.data ?? []).filter((m) => m.status === 'proposed' && (!conversationId || m.conversationId === conversationId || m.conversationId === null));
  if (!pending.length && !error && !notice) return null;

  const act = async (m: MetricsAgentMemory, kind: 'save' | 'dismiss') => {
    setBusyId(m.id); setError(''); setNotice('');
    try {
      if (kind === 'save') await confirm.mutateAsync({ id: m.id });
      else await remove.mutateAsync({ id: m.id });
      setNotice(kind === 'save' ? 'Memory saved. It will be used in new chats.' : 'Suggestion dismissed.');
      await qc.invalidateQueries({ queryKey: getListMetricsAgentMemoriesQueryKey() });
    } catch (e) {
      setError(errMsg(e, kind === 'save' ? 'This memory could not be saved.' : 'This suggestion could not be dismissed.'));
    } finally { setBusyId(null); }
  };

  return <View style={{ paddingHorizontal: 12, paddingTop: 8, gap: 6 }}>
    {pending.slice(0, 3).map((m) => <View key={m.id} testID={`metrics-agent-suggestion-${m.id}`} style={{ borderWidth: 1, borderColor: `${c.primary}55`, backgroundColor: `${c.primary}10`, borderRadius: 12, padding: 10 }}>
      <Text style={{ color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>SUGGESTED MEMORY · {categoryLabel(m).toUpperCase()}</Text>
      <Text style={{ color: c.foreground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, marginTop: 4 }}>{m.content}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <SmallBtn label="Save memory" icon="check" primary disabled={busyId !== null} loading={busyId === m.id && confirm.isPending} onPress={() => void act(m, 'save')} testID={`metrics-agent-suggestion-save-${m.id}`} />
        <SmallBtn label="Dismiss" icon="x" disabled={busyId !== null} loading={busyId === m.id && remove.isPending} onPress={() => void act(m, 'dismiss')} testID={`metrics-agent-suggestion-dismiss-${m.id}`} />
        <Text style={{ flex: 1, color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 }}>Not saved until you confirm.</Text>
      </View>
    </View>)}
    {error ? <Text accessibilityRole="alert" style={{ color: c.destructive, fontFamily: 'Inter_500Medium', fontSize: 11 }}>{error}</Text> : null}
    {notice && !error ? <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 11 }}>{notice}</Text> : null}
  </View>;
}

function SmallBtn({ label, icon, onPress, primary, disabled, loading, testID }: { label: string; icon: 'check' | 'x' | 'trash-2'; onPress: () => void; primary?: boolean; disabled?: boolean; loading?: boolean; testID?: string }) {
  const c = useColors();
  const fg = primary ? c.primaryForeground : c.foreground;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: primary ? c.primary : c.border, backgroundColor: primary ? c.primary : c.card, opacity: disabled && !loading ? 0.5 : 1 }}>
    {loading ? <ActivityIndicator size="small" color={fg} /> : <Feather name={icon} size={13} color={fg} />}
    <Text style={{ color: fg, fontFamily: 'Inter_700Bold', fontSize: 11 }}>{label}</Text>
  </Pressable>;
}

export function AgentSettings({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, minHeight: 0, borderWidth: 1, borderColor: c.border, borderRadius: 18, overflow: 'hidden', backgroundColor: c.card }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 6, borderBottomWidth: 1, borderColor: c.border }}>
      <Pressable testID="metrics-agent-settings-back" accessibilityRole="button" accessibilityLabel="Back to chat" onPress={onBack}
        style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}>
        <Feather name="arrow-left" size={18} color={c.primary} />
        <Text style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Back to chat</Text>
      </Pressable>
      <Text style={{ flex: 1, textAlign: 'right', paddingRight: 10, color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Agent settings</Text>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: 14, paddingBottom: Math.max(insets.bottom, 14) + 12, gap: 18 }}>
      <ProfileSection />
      <MemorySection />
    </ScrollView>
  </View>;
}

function SectionHead({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  const c = useColors();
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>{title}</Text>
      <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 }}>{sub}</Text>
    </View>
    {right}
  </View>;
}

function ProfileSection() {
  const c = useColors();
  const qc = useQueryClient();
  const { role } = useApp();
  const isAdmin = role === 'Admin';
  const profileQuery = useGetMetricsAgentAcademyProfile({ query: { queryKey: getGetMetricsAgentAcademyProfileQueryKey(), refetchOnWindowFocus: false } });
  const update = useUpdateMetricsAgentAcademyProfile();
  const [draft, setDraft] = useState<MetricsAgentAcademyProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const initialized = useRef(false);

  useEffect(() => {
    if (profileQuery.data && !initialized.current) { initialized.current = true; setDraft(profileQuery.data); }
  }, [profileQuery.data]);

  const server = profileQuery.data;
  const dirty = Boolean(server && draft && FIELDS.some((f) => draft[f.key] !== server[f.key]));
  const nameInvalid = Boolean(draft && !draft.academyName.trim());

  const startEdit = () => { if (server) setDraft(server); setEditing(true); setSaved(''); setError(''); };
  const cancel = () => { if (server) setDraft(server); setEditing(false); setError(''); };
  const save = async () => {
    if (!draft || nameInvalid) return;
    setError(''); setSaved('');
    const payload: MetricsAgentAcademyProfile = { ...draft };
    for (const field of FIELDS) payload[field.key] = draft[field.key].trim();
    try {
      const next = await update.mutateAsync({ data: payload });
      qc.setQueryData(getGetMetricsAgentAcademyProfileQueryKey(), next);
      setDraft(next); setEditing(false);
      setSaved('Academy profile saved. New answers will use it.');
    } catch (e) { setError(errMsg(e, 'The academy profile could not be saved.')); }
  };

  return <View>
    <SectionHead
      title="Academy profile"
      sub={isAdmin ? 'Shared with all staff. Gives the agent context for answers and captions.' : 'Shared with all staff. Only Admins can edit this profile.'}
      right={isAdmin && server && !editing ? <SmallBtn label="Edit" icon="check" onPress={startEdit} testID="metrics-agent-profile-edit" /> : null}
    />
    {profileQuery.isLoading ? <><Skeleton h={54} /><Skeleton h={54} /><Skeleton h={54} /></>
      : profileQuery.isError || !draft ? <ErrorBox message={errMsg(profileQuery.error, 'The academy profile could not load.')} onRetry={() => void profileQuery.refetch()} />
        : <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.background }}>
          {FIELDS.map((f, i) => {
            const value = draft[f.key];
            return <View key={f.key} style={{ padding: 11, borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ flex: 1, color: c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{f.label}</Text>
                {editing ? <Text style={{ color: value.length > f.max * 0.9 ? c.destructive : c.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10 }}>{value.length}/{f.max}</Text> : null}
              </View>
              {editing
                ? <>
                  <TextInput testID={`metrics-agent-profile-${f.key}`} value={value} maxLength={f.max} multiline={f.multiline}
                    onChangeText={(t) => { setDraft((d) => d ? { ...d, [f.key]: t } : d); setSaved(''); }}
                    placeholder={f.hint} placeholderTextColor={c.mutedForeground} editable={!update.isPending}
                    style={{ marginTop: 6, minHeight: f.multiline ? 64 : 40, maxHeight: 160, borderWidth: 1, borderColor: f.key === 'academyName' && nameInvalid ? c.destructive : c.border, borderRadius: 10, paddingHorizontal: 10, paddingTop: 9, paddingBottom: 9, color: c.foreground, backgroundColor: c.card, fontFamily: 'Inter_400Regular', fontSize: 13, textAlignVertical: 'top' }} />
                  {f.key === 'academyName' && nameInvalid ? <Text style={{ color: c.destructive, fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 4 }}>Academy name is required.</Text> : null}
                </>
                : <Text style={{ color: value ? c.foreground : c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 4 }}>{value || 'Not set'}</Text>}
            </View>;
          })}
        </View>}
    {editing ? <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
      <Btn label="Cancel" kind="ghost" disabled={update.isPending} onPress={cancel} />
      <Btn label={dirty ? 'Save profile' : 'No changes'} icon="check" loading={update.isPending} disabled={!dirty || nameInvalid} onPress={() => void save()} testID="metrics-agent-profile-save" />
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: c.destructive, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 }}>{error}</Text> : null}
    {saved ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}><Feather name="check-circle" size={14} color={c.primary} /><Text style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{saved}</Text></View> : null}
  </View>;
}

function MemorySection() {
  const c = useColors();
  const qc = useQueryClient();
  const memories = useListMetricsAgentMemories();
  const confirm = useConfirmMetricsAgentMemory();
  const remove = useDeleteMetricsAgentMemory();
  const clear = useClearMetricsAgentMemories();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const list = memories.data ?? [];
  const pending = list.filter((m) => m.status === 'proposed');
  const confirmed = list.filter((m) => m.status === 'confirmed');
  const refresh = () => qc.invalidateQueries({ queryKey: getListMetricsAgentMemoriesQueryKey() });

  const act = async (m: MetricsAgentMemory, kind: 'confirm' | 'dismiss' | 'remove') => {
    setBusyId(m.id); setError(''); setNotice('');
    try {
      if (kind === 'confirm') await confirm.mutateAsync({ id: m.id });
      else await remove.mutateAsync({ id: m.id });
      setNotice(kind === 'confirm' ? 'Memory saved.' : kind === 'dismiss' ? 'Suggestion dismissed.' : 'Memory removed.');
      await refresh();
    } catch (e) { setError(errMsg(e, 'That change could not be made.')); }
    finally { setBusyId(null); }
  };
  const clearAll = async () => {
    setError(''); setNotice('');
    try { await clear.mutateAsync(); setClearOpen(false); setNotice('All your memories were cleared.'); await refresh(); }
    catch (e) { setClearOpen(false); setError(errMsg(e, 'Your memories could not be cleared.')); }
  };

  const row = (m: MetricsAgentMemory, i: number) => <View key={m.id} testID={`metrics-agent-memory-${m.id}`} style={{ padding: 11, borderTopWidth: i ? 1 : 0, borderColor: c.border, gap: 7 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ color: m.status === 'proposed' ? c.primary : c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>{categoryLabel(m).toUpperCase()}</Text>
      <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 }}>· {new Date(m.createdAt).toLocaleDateString()}</Text>
    </View>
    <Text style={{ color: c.foreground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 }}>{m.content}</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {m.status === 'proposed'
        ? <>
          <SmallBtn label="Save memory" icon="check" primary disabled={busyId !== null} loading={busyId === m.id && confirm.isPending} onPress={() => void act(m, 'confirm')} testID={`metrics-agent-memory-confirm-${m.id}`} />
          <SmallBtn label="Dismiss" icon="x" disabled={busyId !== null} loading={busyId === m.id && remove.isPending} onPress={() => void act(m, 'dismiss')} testID={`metrics-agent-memory-dismiss-${m.id}`} />
        </>
        : <SmallBtn label="Remove" icon="trash-2" disabled={busyId !== null} loading={busyId === m.id} onPress={() => void act(m, 'remove')} testID={`metrics-agent-memory-remove-${m.id}`} />}
    </View>
  </View>;

  return <View>
    <SectionHead title="Your memories" sub="Private to you. Only confirmed memories are supplied to the agent in new chats. Suggestions are never saved without your approval." />
    {memories.isLoading ? <><Skeleton h={64} /><Skeleton h={64} /></>
      : memories.isError ? <ErrorBox message={errMsg(memories.error, 'Your memories could not load.')} onRetry={() => void memories.refetch()} />
        : !list.length ? <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 14, padding: 18, alignItems: 'center' }}>
          <Feather name="bookmark" size={20} color={c.mutedForeground} />
          <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 8 }}>No memories yet</Text>
          <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 17 }}>When the agent suggests remembering a preference in chat, you can save it here.</Text>
        </View>
          : <View style={{ gap: 12 }}>
            {pending.length ? <View>
              <Text style={{ color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 11, marginBottom: 6 }}>Pending suggestions ({pending.length}) · not used yet</Text>
              <View style={{ borderWidth: 1, borderColor: `${c.primary}55`, borderRadius: 14, backgroundColor: `${c.primary}0D` }}>{pending.map(row)}</View>
            </View> : null}
            <View>
              <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 11, marginBottom: 6 }}>Confirmed ({confirmed.length}) · used in new chats</Text>
              {confirmed.length ? <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.background }}>{confirmed.map(row)}</View>
                : <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>No confirmed memories.</Text>}
            </View>
          </View>}
    {error ? <Text accessibilityRole="alert" style={{ color: c.destructive, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 }}>{error}</Text> : null}
    {notice && !error ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}><Feather name="check-circle" size={14} color={c.primary} /><Text style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{notice}</Text></View> : null}
    {list.length ? <View style={{ marginTop: 14, alignItems: 'flex-start' }}>
      <Btn label="Clear all my memories" icon="trash-2" kind="danger" disabled={busyId !== null} onPress={() => setClearOpen(true)} testID="metrics-agent-memories-clear" />
    </View> : null}
    <Confirm visible={clearOpen} danger busy={clear.isPending} title="Clear all your memories?"
      copy="This removes every saved memory and pending suggestion for your account. Your conversation history stays, but these preferences will no longer be supplied to the agent in new chats. The shared academy profile is not affected."
      confirmLabel="Clear memories" onConfirm={() => void clearAll()} onCancel={() => setClearOpen(false)} confirmTestID="metrics-agent-memories-clear-confirm" />
  </View>;
}
