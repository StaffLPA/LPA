import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useDecideFormSubmission, useGetFormSubmission, useListFormSources, useUpdateFormSubmission, type FormSubmission } from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Banner, BackButton, Button, FORMS_REFRESH_MS, Skeleton, StatusPill, displayValue, errorMessage, formatDate } from '@/components/forms/common';
import { RosterPicker, useActiveRoster } from '@/components/forms/RosterPicker';
import { Chip } from '@/components/forms/common';
import { acknowledgementQuestionId, designatedReviewers, hasDesignatedReviewers } from '@/components/forms/reviewerPolicy';

export default function FormDetail() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, role } = useApp();
  const staff = role === 'Admin' || role === 'Staff-Coach';
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const q = useGetFormSubmission(id, { query: { queryKey: ['/api/forms/submissions', user?.id ?? 'anon', id], enabled: !!id && staff, refetchInterval: FORMS_REFRESH_MS } });
  const sources = useListFormSources({ query: { queryKey: ['/api/forms/sources', user?.id ?? 'anon'], enabled: staff } });
  const sub = q.data;
  const [pending, setPending] = useState<'Approved' | 'Denied' | null>(null);
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState('');
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [coachIds, setCoachIds] = useState<string[] | null>(null);
  const [studentId, setStudentId] = useState<string | null | undefined>(undefined);
  const inFlight = useRef(false);

  const finish = (next: FormSubmission) => {
    qc.setQueryData(['/api/forms/submissions', user?.id ?? 'anon', id], next);
    void qc.invalidateQueries({ queryKey: ['/api/forms/submissions'] });
    void qc.invalidateQueries({ queryKey: ['/api/forms/notifications'] });
  };
  const decide = useDecideFormSubmission();
  const update = useUpdateFormSubmission();
  useEffect(() => { setCoachIds(null); setStudentId(undefined); }, [id, sub?.revision]);

  if (!staff) return <View testID="forms-access-denied" style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top + 18, paddingHorizontal: 20 }]}>
    <BackButton icon="x" label="Close" onPress={() => router.replace('/(tabs)/more')} />
    <Text style={[styles.meta, { color: c.mutedForeground, marginTop: 18 }]}>Microsoft Forms Submissions is available to Admin and Staff-Coach accounts only.</Text>
  </View>;

  if (!sub) {
    return <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top + 18, paddingHorizontal: 20 }]}>
      <BackButton icon="x" label="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/forms'))} />
      <View style={{ height: 18 }} />
      {q.isError ? <Banner tone="error" text={errorMessage(q.error, 'This form could not be opened. It may not be assigned to you.')} onRetry={() => void q.refetch()} /> : <><Skeleton height={120} /><Skeleton /><Skeleton /></>}
    </View>;
  }

  const isFinal = sub.status === 'Approved' || sub.status === 'Denied';
  const source = (sources.data?.sources ?? []).find((x) => x.id === sub.sourceId);
  const fixedReviewers = hasDesignatedReviewers(sub.formName, source?.microsoftFormId);
  const overriding = sub.canAdminister && !fixedReviewers && !!sources.data;
  const canAct = sub.requiresApproval && (overriding || (sub.canDecide && !isFinal));
  const trimmed = reason.trim();
  const needsReason = pending === 'Denied';
  const reasonOk = !needsReason || (trimmed.length > 0 && trimmed.length <= 500);
  const overrideOk = !overriding || override.trim().length > 0;

  const confirm = () => {
    if (!pending || inFlight.current || !reasonOk || !overrideOk) return;
    inFlight.current = true;
    setResult(null);
    decide.mutate({ submissionId: id, data: { action: pending, revision: sub.revision, ...(pending === 'Denied' ? { reason: trimmed } : {}), ...(overriding ? { overrideReason: override.trim() } : {}) } }, {
      onSuccess: (next) => { finish(next); setPending(null); setReason(''); setOverride(''); setResult({ tone: 'success', text: `Submission ${next.status.toLowerCase()}.` }); },
      onError: (e) => { setPending(null); setResult({ tone: 'error', text: errorMessage(e, 'The decision could not be saved.') }); void q.refetch(); },
      onSettled: () => { inFlight.current = false; },
    });
  };

  const saveAssignment = () => {
    const ids = coachIds ?? sub.coachIds;
    const sid = studentId === undefined ? sub.studentId : studentId;
    update.mutate({ submissionId: id, data: { coachIds: ids, studentId: sid, revision: sub.revision } }, {
      onSuccess: (next) => { finish(next); setResult({ tone: 'success', text: 'Assignment updated.' }); },
      onError: (e) => { setResult({ tone: 'error', text: errorMessage(e, 'Assignment could not be saved.') }); void q.refetch(); },
    });
  };

  const fieldLabels = (sources.data?.sources ?? []).find((x) => x.id === sub.sourceId)?.fieldLabels ?? {};
  const entries = Object.entries(sub.fields ?? {}).filter(([key]) => key !== acknowledgementQuestionId && !key.endsWith(` (${acknowledgementQuestionId})`));

  return <View style={[styles.container, { backgroundColor: c.background }]}>
    <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={[styles.content, { paddingTop: insets.top + (Platform.OS === 'web' ? 40 : 18), paddingBottom: insets.bottom + 48 }]}>
      <BackButton icon="x" label="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/forms'))} />
      <View style={{ height: 18 }} />
      <StatusPill status={sub.status} />
      <Text style={[styles.title, { color: c.foreground }]}>{sub.formName}</Text>
      <Text style={[styles.meta, { color: c.mutedForeground }]}>Submitted {formatDate(sub.submittedAt)}</Text>
      <View style={{ height: 14 }} />
      {result ? <Banner tone={result.tone} text={result.text} /> : null}
      {sub.needsAttention.length > 0 ? <Banner tone="error" text={`Needs attention: ${sub.needsAttention.join(', ')}`} /> : null}
      {sub.status === 'Denied' && sub.denialReason ? <Banner tone="error" text={`Denial reason: ${sub.denialReason}`} /> : null}

      <Card title="People">
        <Row k="Student" v={sub.studentName || 'Not matched'} />
        <Row k="Parent" v={sub.parentName || 'Unknown'} />
        {sub.parentEmail ? <Row k="Parent email" v={sub.parentEmail} /> : null}
        {sub.requiresApproval ? <Row k="Coaches who can decide" v={fixedReviewers ? designatedReviewers.map((p) => p.name).join(', ') : sub.coachNames.length ? sub.coachNames.join(', ') : 'None assigned'} /> : null}
        <Text style={[styles.meta, { color: c.mutedForeground, marginBottom: 10 }]}>All active Admin and Staff-Coach users receive notifications. Notification access does not grant approval permission.</Text>
        <Row k="Requires approval" v={sub.requiresApproval ? 'Yes - first valid decision is final' : 'No - notification only'} />
        {isFinal ? <Row k="Decided" v={`${sub.decisionBy ?? 'Unknown'}${sub.decidedAt ? ` - ${formatDate(sub.decidedAt)}` : ''}`} /> : null}
      </Card>

      <Card title="Responses">
        {entries.length === 0 ? <Text style={[styles.meta, { color: c.mutedForeground }]}>No answers were captured.</Text> : entries.map(([k, v]) => <Row key={k} k={fieldLabels[k] || k} v={displayValue(v)} />)}
      </Card>

      {canAct ? <Card title={overriding ? 'Admin override' : 'Decision'}>
        {overriding ? <Text style={[styles.meta, { color: c.mutedForeground, marginBottom: 10 }]}>{isFinal ? 'This submission is already final. Changing it requires an override reason recorded in the audit trail.' : 'An Admin decision overrides designated coach review and requires an explanation recorded in the audit trail.'}</Text> : null}
        <View style={styles.actions}>
          <View style={{ flex: 1 }}><Button testID="form-approve" label="Approve" disabled={decide.isPending} onPress={() => { setResult(null); setPending('Approved'); }} /></View>
          <View style={{ flex: 1 }}><Button testID="form-deny" label="Deny" tone="danger" disabled={decide.isPending} onPress={() => { setResult(null); setPending('Denied'); }} /></View>
        </View>
      </Card> : sub.requiresApproval && !isFinal ? <Text style={[styles.meta, { color: c.mutedForeground, marginBottom: 14 }]}>Waiting on an assigned coach to decide.</Text> : null}

      {sub.requiresApproval && sub.canAdminister && !fixedReviewers && !isFinal ? <AssignmentCard fixedReviewers={fixedReviewers} sub={sub} coachIds={coachIds ?? sub.coachIds} setCoachIds={setCoachIds} studentId={studentId === undefined ? sub.studentId : studentId} setStudentId={setStudentId} onSave={saveAssignment} saving={update.isPending} dirty={coachIds !== null || studentId !== undefined} /> : null}

      {staff && sub.audit.length > 0 ? <Card title="Audit trail">
        {sub.audit.map((a) => <View key={a.id} style={styles.audit}>
          <Text style={[styles.k, { color: c.foreground }]}>{a.action}</Text>
          <Text style={[styles.meta, { color: c.mutedForeground }]}>{a.actorName} - {formatDate(a.createdAt)}</Text>
          {a.reason ? <Text style={[styles.meta, { color: c.mutedForeground }]}>{a.reason}</Text> : null}
        </View>)}
      </Card> : null}

      {sub.conversationId ? <Button label="Open LPA Forms Submission" tone="ghost" onPress={() => router.push(`/chat/${sub.conversationId}`)} /> : null}
    </KeyboardAwareScrollViewCompat>

    <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => !decide.isPending && setPending(null)}>
      <Pressable style={styles.scrim} onPress={() => !decide.isPending && setPending(null)} accessibilityLabel="Dismiss" />
      <View pointerEvents="box-none" style={styles.sheetWrap}>
        <KeyboardAwareScrollViewCompat bottomOffset={16} style={{ maxHeight: '85%', flexGrow: 0 }} contentContainerStyle={[styles.sheet, { backgroundColor: c.card, borderColor: c.border, paddingBottom: insets.bottom + 20 }]}>
          <Text style={[styles.title, { color: c.foreground, fontSize: 21 }]}>{pending === 'Approved' ? 'Approve this submission?' : 'Deny this submission?'}</Text>
          <Text style={[styles.meta, { color: c.mutedForeground, marginVertical: 8 }]}>{sub.studentName} - {sub.formName}. The first valid decision is final for every assigned coach.</Text>
          {needsReason ? <>
            <Text style={[styles.k, { color: c.mutedForeground }]}>Reason for denial (required)</Text>
            <TextInput testID="form-deny-reason" value={reason} onChangeText={setReason} editable={!decide.isPending} multiline maxLength={500} placeholder="Explain why this was denied" placeholderTextColor={c.mutedForeground} style={[styles.textarea, { color: c.foreground, borderColor: c.border, backgroundColor: c.secondary }]} />
            <Text style={[styles.meta, { color: c.mutedForeground, textAlign: 'right' }]}>{reason.length}/500</Text>
          </> : null}
          {overriding ? <>
            <Text style={[styles.k, { color: c.mutedForeground, marginTop: 8 }]}>Override reason (required)</Text>
            <TextInput testID="form-override-reason" value={override} onChangeText={setOverride} editable={!decide.isPending} multiline placeholder="Why is the final decision changing?" placeholderTextColor={c.mutedForeground} style={[styles.textarea, { color: c.foreground, borderColor: c.border, backgroundColor: c.secondary }]} />
          </> : null}
          <View style={[styles.actions, { marginTop: 14 }]}>
            <View style={{ flex: 1 }}><Button label="Cancel" tone="ghost" disabled={decide.isPending} onPress={() => setPending(null)} /></View>
            <View style={{ flex: 1 }}><Button testID="form-confirm" label={pending === 'Approved' ? 'Confirm approval' : 'Confirm denial'} tone={pending === 'Denied' ? 'danger' : 'primary'} loading={decide.isPending} disabled={!reasonOk || !overrideOk} onPress={confirm} /></View>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  </View>;
}

function AssignmentCard({ sub, coachIds, setCoachIds, studentId, setStudentId, onSave, saving, dirty, fixedReviewers }: { sub: FormSubmission; coachIds: string[]; setCoachIds: (v: string[]) => void; studentId: string | null; setStudentId: (v: string | null) => void; onSave: () => void; saving: boolean; dirty: boolean; fixedReviewers: boolean }) {
  const c = useColors();
  const { people } = useActiveRoster([], true);
  return <Card title="Assignment (Admin)">
    {fixedReviewers ? <Text style={[styles.meta, { color: c.mutedForeground, marginBottom: 14 }]}>Reviewers are fixed to {designatedReviewers.map((p) => p.name).join(', ')}. Accounts must be active to decide.</Text> : <RosterPicker testID="form-coaches" label="COACHES WHO CAN DECIDE" selected={coachIds} onChange={setCoachIds} />}
    <Text style={[styles.k, { color: c.mutedForeground, marginBottom: 8 }]}>STUDENT</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
      <Chip label="None" selected={studentId === null} onPress={() => setStudentId(null)} />
      {people.map((p) => <Chip key={p.id} label={p.fullName} selected={studentId === p.id} onPress={() => setStudentId(p.id)} />)}
    </View>
    <Button testID="form-save-assignment" label="Save assignment" loading={saving} disabled={!dirty} onPress={onSave} />
    <Text style={[styles.meta, { color: c.mutedForeground, marginTop: 8 }]}>Revision {sub.revision}</Text>
  </Card>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}><Text style={[styles.cardTitle, { color: c.primary }]}>{title.toUpperCase()}</Text>{children}</View>;
}
function Row({ k, v }: { k: string; v: string }) {
  const c = useColors();
  return <View style={styles.rowItem}><Text style={[styles.k, { color: c.mutedForeground }]}>{k}</Text><Text selectable style={[styles.v, { color: c.foreground }]}>{v}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: -0.7, marginTop: 10 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 14 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 10 },
  rowItem: { marginBottom: 12 },
  k: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginBottom: 3 },
  v: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  audit: { marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20 },
  textarea: { borderWidth: 1, borderRadius: 14, minHeight: 90, padding: 12, textAlignVertical: 'top', fontFamily: 'Inter_400Regular', fontSize: 14 },
});
