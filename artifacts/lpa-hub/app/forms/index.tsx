import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListFormNotifications, useListFormSources, useListFormSubmissions, useReadFormNotification, type ListFormSubmissionsParams } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { useActiveRoster } from '@/components/forms/RosterPicker';
import { Banner, BackButton, Chip, FORMS_REFRESH_MS, Skeleton, StatusPill, errorMessage, formatDate } from '@/components/forms/common';
import { visibleFormMessageText } from '@/lib/formMessageText';

const STATUSES = ['New', 'Pending Approval', 'Approved', 'Denied'];

export default function FormsList() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { role, user } = useApp();
  const isAdmin = role === 'Admin' || role === 'Staff-Coach';
  const isStaff = isAdmin;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const coaches = useActiveRoster(['Admin', 'Staff-Coach'], false, isStaff);
  const students = useActiveRoster([], true, isStaff);
  const dateOk = (v: string) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
  const params = useMemo<ListFormSubmissionsParams>(() => {
    const p: ListFormSubmissionsParams = {};
    if (search.trim()) p.search = search.trim();
    if (status) p.status = status;
    if (formId) p.formId = formId;
    if (coachId) p.coachId = coachId;
    if (studentId) p.studentId = studentId;
    if (from && dateOk(from)) p.from = `${from}T00:00:00.000-07:00`;
    if (to && dateOk(to)) p.to = `${to}T23:59:59.999-07:00`;
    return p;
  }, [search, status, formId, coachId, studentId, from, to]);
  const list = useListFormSubmissions(params, { query: { queryKey: ['/api/forms/submissions', user?.id ?? 'anon', params], enabled: isStaff, refetchInterval: FORMS_REFRESH_MS } });
  const sources = useListFormSources({ query: { queryKey: ['/api/forms/sources', user?.id ?? 'anon'], enabled: isAdmin, refetchInterval: FORMS_REFRESH_MS } });
  const notes = useListFormNotifications({ query: { queryKey: ['/api/forms/notifications', user?.id ?? 'anon'], enabled: isStaff, refetchInterval: FORMS_REFRESH_MS } });
  const markRead = useReadFormNotification({ mutation: { onSuccess: () => { void qc.invalidateQueries({ queryKey: ['/api/forms/notifications'] }); } } });
  const unread = (notes.data ?? []).filter((n) => !n.readAt);
  const health = sources.data;
  const [knownForms, setKnownForms] = useState<Record<string, string>>({});
  const rows = list.data;
  React.useEffect(() => {
    if (!rows) return;
    setKnownForms((prev) => { const next = { ...prev }; rows.forEach((r) => { next[r.sourceId] = r.formName; }); return next; });
  }, [rows]);
  const forms = isAdmin ? (sources.data?.sources ?? []).map((f) => ({ id: f.id, name: f.name })) : Object.entries(knownForms).map(([id, name]) => ({ id, name }));

  const openNote = (n: { id: string; submissionId: string; readAt: string | null }) => {
    if (!n.readAt) markRead.mutate({ notificationId: n.id });
    router.push(`/forms/${n.submissionId}`);
  };
  if (!isStaff) return <View testID="forms-access-denied" style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top + 18, paddingHorizontal: 20 }]}>
    <BackButton onPress={() => router.replace('/(tabs)/more')} />
    <Text style={[styles.meta, { color: c.mutedForeground, marginTop: 18 }]}>Microsoft Forms Submissions is available to Admin and Staff-Coach accounts only.</Text>
  </View>;

  const header = <View>
    <View style={styles.topRow}>
      <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'))} />
      {isAdmin ? <Pressable testID="forms-settings" accessibilityRole="button" accessibilityLabel="Form settings" onPress={() => router.push('/forms/settings')} style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}><Feather name="layout" size={18} color={c.foreground} /></Pressable> : null}
    </View>
    <Text style={[styles.eyebrow, { color: c.primary }]}>MICROSOFT FORMS</Text>
    <Text style={[styles.title, { color: c.foreground }]}>Form submissions</Text>
    {isAdmin && health && (!health.webhookConfigured || health.failedDeliveries > 0 || health.pendingDeliveries > 0) ? <Banner tone={health.failedDeliveries > 0 || !health.webhookConfigured ? 'error' : 'info'} text={`${health.webhookConfigured ? 'Webhook connected.' : 'Webhook secret is not configured on the server.'} ${health.pendingDeliveries} pending, ${health.failedDeliveries} failed deliveries.`} /> : null}
    {unread.length > 0 ? <View style={[styles.notes, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.noteHead, { color: c.foreground }]}>{unread.length} unread notification{unread.length === 1 ? '' : 's'}</Text>
      {unread.slice(0, 4).map((n) => <Pressable key={n.id} testID={`form-note-${n.id}`} accessibilityRole="button" onPress={() => openNote(n)} style={[styles.note, { borderColor: c.border }]}>
        <View style={[styles.dot, { backgroundColor: c.primary }]} />
        <View style={{ flex: 1 }}><Text style={[styles.noteTitle, { color: c.foreground }]}>{visibleFormMessageText(n.title)}</Text><Text numberOfLines={2} style={[styles.meta, { color: c.mutedForeground }]}>{visibleFormMessageText(n.body)}</Text></View>
      </Pressable>)}
    </View> : null}
    <View style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
      <Feather name="search" size={16} color={c.mutedForeground} />
      <TextInput testID="forms-search" value={search} onChangeText={setSearch} placeholder="Search student, parent, or form" placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground }]} returnKeyType="search" />
      <Pressable accessibilityRole="button" accessibilityLabel="Toggle filters" onPress={() => setShowFilters((v) => !v)}><Feather name="grid" size={18} color={showFilters || status || formId || coachId || studentId || from || to ? c.primary : c.mutedForeground} /></Pressable>
    </View>
    {showFilters ? <View style={[styles.filters, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.fl, { color: c.mutedForeground }]}>STATUS</Text>
      <View style={styles.wrap}>{STATUSES.map((x) => <Chip key={x} label={x} selected={status === x} onPress={() => setStatus(status === x ? null : x)} />)}</View>
      {forms.length > 0 ? <><Text style={[styles.fl, { color: c.mutedForeground }]}>FORM</Text>
        <View style={styles.wrap}>{forms.map((f) => <Chip key={f.id} label={f.name} selected={formId === f.id} onPress={() => setFormId(formId === f.id ? null : f.id)} />)}</View></> : null}
      {isStaff ? <><Text style={[styles.fl, { color: c.mutedForeground }]}>COACH</Text>
        <View style={styles.wrap}>
          {user?.id ? <Chip testID="forms-filter-mine" label="Assigned to me" selected={coachId === user.id} onPress={() => setCoachId(coachId === user.id ? null : user.id)} /> : null}
          {coaches.people.filter((p) => p.id !== user?.id).map((p) => <Chip key={p.id} label={p.fullName} selected={coachId === p.id} onPress={() => setCoachId(coachId === p.id ? null : p.id)} />)}
        </View>
        <Text style={[styles.fl, { color: c.mutedForeground }]}>STUDENT</Text>
        <View style={styles.wrap}>
          {students.people.length === 0 ? <Text style={[styles.meta, { color: c.mutedForeground }]}>{students.query.isLoading ? 'Loading roster...' : 'No active students available.'}</Text> : students.people.map((p) => <Chip key={p.id} label={p.fullName} selected={studentId === p.id} onPress={() => setStudentId(studentId === p.id ? null : p.id)} />)}
        </View></> : null}
      <Text style={[styles.fl, { color: c.mutedForeground }]}>DATE RANGE (YYYY-MM-DD)</Text>
      <View style={styles.wrap}>
        <TextInput testID="forms-from" value={from} onChangeText={setFrom} placeholder="From" placeholderTextColor={c.mutedForeground} autoCapitalize="none" style={[styles.date, { color: c.foreground, borderColor: dateOk(from) ? c.border : c.destructive }]} />
        <TextInput testID="forms-to" value={to} onChangeText={setTo} placeholder="To" placeholderTextColor={c.mutedForeground} autoCapitalize="none" style={[styles.date, { color: c.foreground, borderColor: dateOk(to) ? c.border : c.destructive }]} />
      </View>
      {null}
    </View> : null}
    {list.isError ? <Banner tone="error" text={errorMessage(list.error, 'Forms could not load.')} onRetry={() => void list.refetch()} /> : null}
  </View>;

  return <View style={[styles.container, { backgroundColor: c.background }]}>
    <FlatList
      data={list.data ?? []}
      keyExtractor={(i) => i.id}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }]}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isLoading} onRefresh={() => { void list.refetch(); void notes.refetch(); }} tintColor={c.primary} />}
      ListEmptyComponent={list.isLoading ? <View><Skeleton /><Skeleton /><Skeleton /></View> : list.isError ? null : <View style={styles.empty}><Feather name="file-text" size={28} color={c.mutedForeground} /><Text style={[styles.noteTitle, { color: c.foreground, marginTop: 10 }]}>No submissions</Text><Text style={[styles.meta, { color: c.mutedForeground, textAlign: 'center' }]}>Responses from connected Microsoft Forms will appear here.</Text></View>}
      renderItem={({ item }) => <Pressable testID={`form-row-${item.id}`} accessibilityRole="button" onPress={() => router.push(`/forms/${item.id}`)} style={[styles.row, { backgroundColor: c.secondary, borderColor: c.border }]}>
        <View style={{ flex: 1, gap: 5 }}>
          <StatusPill status={item.status} />
          <Text style={[styles.rowTitle, { color: c.foreground }]}>{item.studentName || item.parentName || 'Unknown student'}</Text>
          <Text style={[styles.meta, { color: c.mutedForeground }]}>{item.formName} - {formatDate(item.submittedAt)}</Text>
          {item.needsAttention.length > 0 ? <Text style={[styles.meta, { color: c.destructive }]}>{item.needsAttention.join(', ')}</Text> : null}
        </View>
        {item.canDecide ? <Text style={[styles.act, { color: c.primary }]}>Review</Text> : null}
        <Feather name="chevron-right" size={18} color={c.mutedForeground} />
      </Pressable>}
    />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  iconBtn: { width: 46, height: 46, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8, marginBottom: 16 },
  notes: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 12 },
  noteHead: { fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 6 },
  note: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  noteTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, minHeight: 48, marginBottom: 12 },
  input: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, minHeight: 44 },
  filters: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 12 },
  fl: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, marginTop: 10, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  date: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 40, minWidth: 130, fontFamily: 'Inter_400Regular', fontSize: 13 },
  row: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  act: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 4 },
});
