import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useListFormSources, useSaveFormSource, useSaveOutlookFormRelay, useSyncOutlookFormRelay, type FormSource, type FormSourceInput } from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Banner, BackButton, Button, FORMS_REFRESH_MS, Skeleton, errorMessage, formatDate } from '@/components/forms/common';
import { RosterPicker } from '@/components/forms/RosterPicker';
import { designatedReviewers, hasDesignatedReviewers } from '@/components/forms/reviewerPolicy';

type Draft = { id?: string; microsoftFormId: string; name: string; requiresApproval: boolean; enabled: boolean; labelsJson: string; defaultCoachIds: string[]; notificationUserIds: string[] };
function parseLabels(src: string): Record<string, string> | null {
  try {
    const v: unknown = JSON.parse(src);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) { if (typeof val !== 'string' || !k.trim() || !val.trim()) return null; out[k] = val; }
    return out;
  } catch { return null; }
}
const blank = (): Draft => ({ microsoftFormId: '', name: '', requiresApproval: false, enabled: true, labelsJson: '{}', defaultCoachIds: [], notificationUserIds: [] });
const fromSource = (s: FormSource): Draft => ({ id: s.id, microsoftFormId: s.microsoftFormId, name: s.name, requiresApproval: s.requiresApproval, enabled: s.enabled, labelsJson: JSON.stringify(s.fieldLabels, null, 2), defaultCoachIds: s.defaultCoachIds, notificationUserIds: s.notificationUserIds });

export default function FormSettings() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { role, user } = useApp();
  const q = useListFormSources({ query: { queryKey: ['/api/forms/sources', user?.id ?? 'anon'], enabled: role === 'Admin' || role === 'Staff-Coach', refetchInterval: FORMS_REFRESH_MS } });
  const save = useSaveFormSource();
  const saveRelay = useSaveOutlookFormRelay();
  const syncRelay = useSyncOutlookFormRelay();
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/forms'));

  const inputStyle = [styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.secondary }];
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const submit = (d: Draft) => {
    const fieldLabels = parseLabels(d.labelsJson) ?? {};
    const data: FormSourceInput = { ...(d.id ? { id: d.id } : {}), microsoftFormId: d.microsoftFormId.trim(), name: d.name.trim(), requiresApproval: d.requiresApproval, enabled: d.enabled, fieldLabels, defaultCoachIds: d.defaultCoachIds, notificationUserIds: d.notificationUserIds };
    setMsg(null);
    save.mutate({ data }, {
      onSuccess: () => { setDraft(null); setMsg({ tone: 'success', text: 'Form saved.' }); void qc.invalidateQueries({ queryKey: ['/api/forms/sources'] }); },
      onError: (e) => setMsg({ tone: 'error', text: errorMessage(e, 'The form could not be saved.') }),
    });
  };

  if (role !== 'Admin' && role !== 'Staff-Coach') return <View style={[styles.container, { backgroundColor: c.background, padding: 20, paddingTop: insets.top + 18 }]}><BackButton onPress={back} /><Text style={[styles.copy, { color: c.mutedForeground, marginTop: 18 }]}>Form settings are available to Admin and Staff-Coach accounts.</Text></View>;

  const health = q.data;
  const relay = health?.outlookRelay;
  const relayBusy = saveRelay.isPending || syncRelay.isPending;
  const onRelaySuccess = () => { void qc.invalidateQueries({ queryKey: ['/api/forms/sources'] }); };
  const configureRelay = (enabled: boolean) => {
    setMsg(null);
    saveRelay.mutate({ data: { enabled, ...(enabled ? { notificationUrl: (relayUrl ?? relay?.notificationUrl ?? '').trim() } : {}) } }, {
      onSuccess: (result) => {
        setMsg({ tone: result.enabled && !result.subscriptionReady ? 'error' : 'success',
          text: result.enabled ? result.subscriptionReady ? 'Outlook relay enabled. Send the real Microsoft response to test it.' :
            `Relay enabled, but Microsoft notifications need attention: ${result.lastError ?? 'subscription pending'}. Use Check now to retry.` : 'Outlook relay disabled. Existing responses are retained.' });
        onRelaySuccess();
      },
      onError: (e) => setMsg({ tone: 'error', text: errorMessage(e, 'Outlook relay could not be configured.') }),
    });
  };
  const checkRelay = () => {
    setMsg(null);
    syncRelay.mutate(undefined, {
      onSuccess: (result) => {
        setMsg({ tone: result.lastError || result.failedImports ? 'error' : 'success',
          text: result.lastError ? `Outlook check needs attention: ${result.lastError}` :
            `Outlook checked. Pending imports: ${result.pendingImports}. Failed imports: ${result.failedImports}. Check the submissions dashboard for received responses.` });
        onRelaySuccess();
      },
      onError: (e) => setMsg({ tone: 'error', text: errorMessage(e, 'Outlook could not be checked.') }),
    });
  };
  const labelsOk = !!draft && parseLabels(draft.labelsJson) !== null;
  const valid = !!draft && labelsOk && draft.name.trim().length > 0 && draft.microsoftFormId.trim().length > 0;

  return <View style={[styles.container, { backgroundColor: c.background }]}>
    <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 48 }]}>
      <BackButton onPress={back} />
      <Text style={[styles.eyebrow, { color: c.primary }]}>FORMS SETTINGS</Text>
      <Text style={[styles.title, { color: c.foreground }]}>Connected forms</Text>
      <Text style={[styles.copy, { color: c.mutedForeground, marginBottom: 14 }]}>Every form posts to the staff group LPA Forms Submission. New forms default to notification only; External Training keeps designated-coach approval.</Text>
      {msg ? <Banner tone={msg.tone} text={msg.text} /> : null}
      {q.isError ? <Banner tone="error" text={errorMessage(q.error, 'Settings could not load.')} onRetry={() => void q.refetch()} /> : null}
      {health ? <Banner tone={health.webhookConfigured && health.failedDeliveries === 0 ? 'success' : 'error'} text={`${health.webhookConfigured ? 'Server secret configured (do not include it in emails).' : 'Server secret is NOT configured.'} Pending notifications: ${health.pendingDeliveries}. Failed notifications: ${health.failedDeliveries}.`} /> : null}
      {health?.deliveryErrors?.map((text) => <Banner key={text} tone="error" text={text} />)}
      {health && (health.failedDeliveries > 0 || (relay?.failedImports ?? 0) > 0) ? <Text style={[styles.copy, { color: c.mutedForeground, marginBottom: 12 }]}>Failed items are included in pending totals. Errors do not mean responses were deleted. Checking these settings does not retry delivery.</Text> : null}

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardTitle, { color: c.primary }]}>OUTLOOK RESPONSE RELAY</Text>
        <Text style={[styles.copy, { color: c.mutedForeground }]}>No Power Automate Premium required. Use the connected Outlook account in the flow and send the response email to that same account. LPA imports only matching sent responses, not incoming emails.</Text>
        {relay ? <>
          <Text selectable style={[styles.copy, { color: c.foreground, marginTop: 10 }]}>Mailbox: {relay.mailbox ?? 'Shown after enabling the relay'}</Text>
          <Text style={[styles.copy, { color: c.mutedForeground, marginTop: 6 }]}>{relay.enabled ? relay.subscriptionReady ? 'Enabled. Microsoft notifications connected.' : 'Enabled. Microsoft notification subscription needs attention.' : 'Disabled.'} Pending imports: {relay.pendingImports}. Failed imports: {relay.failedImports}.</Text>
          {relay.lastSyncedAt ? <Text style={[styles.copy, { color: c.mutedForeground }]}>Last checked: {formatDate(relay.lastSyncedAt)}</Text> : null}
          {relay.lastError ? <Banner tone="error" text={`Relay error: ${relay.lastError}. Responses remain in Outlook for retry.`} /> : null}
          {relay.importErrors?.map((text) => <Banner key={text} tone="error" text={text} />)}
          <Text style={[styles.label, { color: c.mutedForeground, marginTop: 12 }]}>PUBLIC API CALLBACK URL</Text>
          <TextInput testID="form-relay-url" value={relayUrl ?? relay.notificationUrl ?? ''} onChangeText={setRelayUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={inputStyle} placeholder="https://your-api-address/api/forms/outlook/events" placeholderTextColor={c.mutedForeground} />
          <Text style={[styles.copy, { color: c.mutedForeground, marginTop: 6 }]}>Microsoft calls this address directly; it is not a premium HTTP flow action. Disable the relay before changing the address. Keep an hourly standard Outlook maintenance flow running so notification renewals and retries continue while LPA is idle.</Text>
          <View style={[styles.actions, { marginTop: 12 }]}>
            <View style={{ flex: 1 }}><Button testID="form-relay-toggle" label={relay.enabled ? 'Disable relay' : 'Enable relay'} tone={relay.enabled ? 'ghost' : 'primary'} loading={saveRelay.isPending} disabled={relayBusy || (!relay.enabled && !(relayUrl ?? relay.notificationUrl ?? '').trim())} onPress={() => configureRelay(!relay.enabled)} /></View>
            <View style={{ flex: 1 }}><Button testID="form-relay-check" label="Check now" tone="ghost" loading={syncRelay.isPending} disabled={relayBusy || !relay.enabled} onPress={checkRelay} /></View>
          </View>
        </> : <Text style={[styles.copy, { color: c.mutedForeground, marginTop: 8 }]}>{q.isLoading ? 'Loading relay settings...' : 'This API must have the Outlook relay update before setup is available.'}</Text>}
      </View>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardTitle, { color: c.primary }]}>POWER AUTOMATE SETUP</Text>
        {['Keep "When a new response is submitted" and "Get response details". Remove the premium HTTP action.', 'Add a Compose action named LPA_Forms_Payload with formId, string responseId, original ISO submittedAt, and the complete rawSubmission object.', 'Add Office 365 Outlook "Send an email (V2)" using the SAME mailbox shown above. Send it to that mailbox itself.', 'Subject must be LPA-FORMS-V1: followed by the Form ID, a colon, and the Response ID. Attach lpa-form-response.json containing the base64-encoded JSON payload.', 'Never include the webhook secret in the flow email. Keep sent response emails until import succeeds; failed imports can be retried with Check now.', 'Save the actual form and field labels below before sending a real Microsoft response. Coach approval and denial stay in LPA.'].map((t, i) => <Text key={i} style={[styles.copy, { color: c.mutedForeground, marginBottom: 6 }]}>{i + 1}. {t}</Text>)}
      </View>

      {q.isLoading ? <><Skeleton /><Skeleton /></> : null}
      {!draft ? <>
        {(q.data?.sources ?? []).map((s) => <Pressable key={s.id} testID={`form-source-${s.id}`} accessibilityRole="button" onPress={() => { setMsg(null); setDraft(fromSource(s)); }} style={[styles.row, { backgroundColor: c.secondary, borderColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: c.foreground }]}>{s.name}</Text>
            <Text style={[styles.copy, { color: c.mutedForeground }]}>{s.enabled ? 'Enabled' : 'Disabled'} - {s.requiresApproval ? 'Approval required' : 'No approval'}</Text>
            <Text style={[styles.copy, { color: c.mutedForeground }]}>{s.lastReceivedAt ? `Last response ${formatDate(s.lastReceivedAt)}` : 'No responses yet'}</Text>
          </View>
        </Pressable>)}
        {q.data && q.data.sources.length === 0 ? <Text style={[styles.copy, { color: c.mutedForeground, marginBottom: 12 }]}>No forms connected yet.</Text> : null}
        <Button testID="form-add-source" label="Add a form" onPress={() => { setMsg(null); setDraft(blank()); }} />
      </> : <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardTitle, { color: c.primary }]}>{draft.id ? 'EDIT FORM' : 'NEW FORM'}</Text>
        <Text style={[styles.label, { color: c.mutedForeground }]}>Name</Text>
        <TextInput testID="form-name" value={draft.name} onChangeText={(v) => patch({ name: v })} style={inputStyle} placeholder="Permission slip" placeholderTextColor={c.mutedForeground} />
        <Text style={[styles.label, { color: c.mutedForeground }]}>Microsoft Form ID</Text>
        <TextInput testID="form-ms-id" value={draft.microsoftFormId} onChangeText={(v) => patch({ microsoftFormId: v })} autoCapitalize="none" autoCorrect={false} style={inputStyle} placeholder="Form ID sent as formId" placeholderTextColor={c.mutedForeground} />
        <View style={styles.switchRow}><Text style={[styles.rowTitle, { color: c.foreground }]}>Enabled</Text><Switch value={draft.enabled} onValueChange={(v) => patch({ enabled: v })} trackColor={{ true: c.primary }} /></View>
        <View style={styles.switchRow}><Text style={[styles.rowTitle, { color: c.foreground }]}>Requires approval</Text><Switch value={draft.requiresApproval} disabled={hasDesignatedReviewers(draft.name, draft.microsoftFormId)} onValueChange={(v) => patch({ requiresApproval: v })} trackColor={{ true: c.primary }} /></View>
        {!draft.requiresApproval ? <Text style={[styles.copy, { color: c.mutedForeground, marginBottom: 12 }]}>Notification only. Responses appear in LPA Forms Submission without Approve or Deny actions.</Text> : null}
        <Text style={[styles.label, { color: c.mutedForeground, marginTop: 10 }]}>FIELD LABELS JSON (raw question ID to exact label)</Text>
        <TextInput testID="form-labels-json" value={draft.labelsJson} onChangeText={(v) => patch({ labelsJson: v })} multiline autoCapitalize="none" autoCorrect={false} placeholder={'{ "<question id from rawSubmission>": "<exact label>" }'} placeholderTextColor={c.mutedForeground} style={[...inputStyle, { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' }]} />
        <Text style={[styles.copy, { color: labelsOk ? c.mutedForeground : c.destructive, marginTop: 6 }]}>{labelsOk ? 'Valid mapping.' : 'Required: a JSON object of question ID to non-empty label text.'}</Text>
        <View style={{ height: 16 }} />
        {hasDesignatedReviewers(draft.name, draft.microsoftFormId) ? <Text style={[styles.copy, { color: c.foreground, marginBottom: 14 }]}>Coaches who can decide: {designatedReviewers.map((p) => p.name).join(', ')}. Only active accounts can decide.</Text> : draft.requiresApproval ? <RosterPicker testID="form-default-coaches" label="DEFAULT COACHES" selected={draft.defaultCoachIds} onChange={(v) => patch({ defaultCoachIds: v })} /> : null}
        <Text style={[styles.copy, { color: c.foreground, marginBottom: 14 }]}>All active Admin and Staff-Coach users receive notifications and may read requests. Only designated reviewers can approve or deny.</Text>
        <View style={styles.actions}>
          <View style={{ flex: 1 }}><Button label="Cancel" tone="ghost" disabled={save.isPending} onPress={() => setDraft(null)} /></View>
          <View style={{ flex: 1 }}><Button testID="form-save" label="Save" loading={save.isPending} disabled={!valid} onPress={() => submit(draft)} /></View>
        </View>
      </View>}
    </KeyboardAwareScrollViewCompat>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginTop: 18, marginBottom: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8, marginBottom: 16 },
  copy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 14 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 10 },
  row: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 11, flexDirection: 'row' },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 3 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, fontFamily: 'Inter_400Regular', fontSize: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  labelRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  x: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
});
