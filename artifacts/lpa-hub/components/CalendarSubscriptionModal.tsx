import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import {
  getGetCalendarSubscriptionQueryKey,
  useGetCalendarSubscription,
  useRevokeCalendarSubscription,
  useSaveCalendarSubscription,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SUBSCRIPTION_NOTE = 'Subscribe to keep your selected LPA calendars updated in your calendar app. Changes appear when your calendar provider refreshes the subscription; updates may take several hours.';

export function CalendarSubscriptionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const subscriptionQuery = useGetCalendarSubscription({ query: { queryKey: getGetCalendarSubscriptionQueryKey(), enabled: visible } });
  const saveSubscription = useSaveCalendarSubscription();
  const revokeSubscription = useRevokeCalendarSubscription();
  const [draftTeamIds, setDraftTeamIds] = useState<string[] | null>(null);
  const [showGoogleInstructions, setShowGoogleInstructions] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible) {
      setDraftTeamIds(null);
      setShowGoogleInstructions(false);
      setConfirmRevoke(false);
      setMessage('');
    }
  }, [visible]);

  const state = subscriptionQuery.data;
  const selectedTeamIds = draftTeamIds ?? state?.selectedTeamIds ?? [];
  const subscriptionUrl = state?.subscriptionUrl ?? null;
  const saving = saveSubscription.isPending;
  const revoking = revokeSubscription.isPending;

  const toggleTeam = (teamId: string) => {
    setDraftTeamIds((current) => {
      const selected = current ?? state?.selectedTeamIds ?? [];
      return selected.includes(teamId)
        ? selected.filter((id) => id !== teamId)
        : [...selected, teamId];
    });
    setMessage('');
  };

  const copyLink = async () => {
    if (!subscriptionUrl) return;
    try {
      await Clipboard.setStringAsync(subscriptionUrl);
      setMessage('Subscription link copied. Keep it private.');
    } catch {
      setMessage('Could not copy the link. Try again or use the calendar instructions below.');
    }
  };

  const save = () => {
    if (!selectedTeamIds.length) return;
    saveSubscription.mutate({ data: { teamIds: selectedTeamIds } }, {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetCalendarSubscriptionQueryKey(), result);
        setDraftTeamIds(null);
        setMessage('Calendar selection saved. Your subscription link stays the same.');
      },
      onError: (error) => setMessage(error.message || 'Could not save the calendar selection.'),
    });
  };

  const openAppleCalendar = async () => {
    if (!subscriptionUrl) return;
    const webcalUrl = subscriptionUrl.replace(/^https:/i, 'webcal:');
    try {
      await Linking.openURL(webcalUrl);
      setMessage('Subscription opened—finish adding it in your calendar app.');
    } catch {
      setMessage('The subscription flow did not open. Copy the HTTPS link and open it in Safari or add it manually in Calendar settings.');
    }
  };

  const openHttpsLink = async () => {
    if (!subscriptionUrl) return;
    try {
      await Linking.openURL(subscriptionUrl);
      setMessage('Opened the HTTPS link in your external browser.');
    } catch {
      setMessage('Could not open the link. Copy it and add it from Apple Calendar’s subscription settings.');
    }
  };

  const revoke = () => {
    revokeSubscription.mutate(undefined, {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetCalendarSubscriptionQueryKey(), result);
        setDraftTeamIds(null);
        setConfirmRevoke(false);
        setMessage('Link access revoked. Remove the subscribed calendar from each device separately; providers may retain cached events.');
      },
      onError: (error) => setMessage(error.message || 'Could not revoke this subscription.'),
    });
  };

  const allSelected = Boolean(state?.availableTeams.length) &&
    state!.availableTeams.every((team) => selectedTeamIds.includes(team.id));

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>LPA CALENDAR</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Sync Calendar</Text>
          </View>
          <Pressable testID="calendar-subscription-close" accessibilityRole="button" accessibilityLabel="Close Sync Calendar"
            onPress={onClose} hitSlop={10} style={styles.closeButton}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {subscriptionQuery.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} /> : null}
        {subscriptionQuery.isError ? <View style={styles.inlineError}>
          <Text style={[styles.body, { color: colors.destructive }]}>Could not load your calendar settings.</Text>
          <Pressable testID="calendar-subscription-retry" onPress={() => void subscriptionQuery.refetch()}>
            <Text style={[styles.link, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View> : null}

        {state ? <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{SUBSCRIPTION_NOTE}</Text>
          <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="lock" size={15} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>This is a private link. Anyone who has it can read the selected schedule. Keep it private and revoke it if it is shared by mistake.</Text>
          </View>

          <View style={styles.selectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose calendars</Text>
            <View style={styles.selectionActions}>
              <Pressable testID="calendar-subscription-select-all" accessibilityRole="button"
                onPress={() => { setDraftTeamIds(state.availableTeams.map((team) => team.id)); setMessage(''); }}>
                <Text style={[styles.link, { color: allSelected ? colors.mutedForeground : colors.primary }]}>Select All</Text>
              </Pressable>
              <Text style={[styles.actionDivider, { color: colors.mutedForeground }]}>·</Text>
              <Pressable testID="calendar-subscription-clear-all" accessibilityRole="button"
                onPress={() => { setDraftTeamIds([]); setMessage(''); }}>
                <Text style={[styles.link, { color: selectedTeamIds.length ? colors.primary : colors.mutedForeground }]}>Clear All</Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.teamList, { borderColor: colors.border }]}>
            {state.availableTeams.map((team, index) => {
              const checked = selectedTeamIds.includes(team.id);
              return <Pressable key={team.id} testID={`calendar-subscription-team-${team.id}`}
                accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => toggleTeam(team.id)}
                style={[styles.teamRow, index < state.availableTeams.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.mutedForeground, backgroundColor: checked ? colors.primary : 'transparent' }]}>
                  {checked ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}
                </View>
                <Text style={[styles.teamLabel, { color: colors.foreground }]}>{team.label}</Text>
              </Pressable>;
            })}
            {!state.availableTeams.length ? <Text style={[styles.body, { color: colors.mutedForeground, padding: 14 }]}>No calendars are available to this account.</Text> : null}
          </View>

          <Pressable testID="calendar-subscription-save" accessibilityRole="button" onPress={save}
            disabled={saving || selectedTeamIds.length === 0}
            style={[styles.primaryButton, { backgroundColor: selectedTeamIds.length ? colors.primary : colors.muted, opacity: saving ? 0.7 : 1 }]}>
            {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              {state.active ? 'Save Calendar Selection' : 'Create Subscription'}
            </Text>}
          </Pressable>
          {selectedTeamIds.length === 0 ? <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Select at least one calendar to continue.</Text> : null}

          {state.active && subscriptionUrl ? <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Add LPA Schedule</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>The calendar is read-only. Make schedule changes in the LPA App.</Text>
            <Pressable testID="calendar-subscription-apple" accessibilityRole="button" onPress={() => void openAppleCalendar()}
              style={[styles.secondaryButton, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="calendar" size={16} color={colors.primary} />
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Add to Apple Calendar</Text>
            </Pressable>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Approve the subscription in Apple Calendar. If an in-app browser blocks it, open the HTTPS link in Safari or use Calendar → Calendars → Add Calendar → Add Subscription Calendar, paste the link, then tap Find and Done.</Text>
            {Platform.OS === 'ios' ? <Pressable testID="calendar-subscription-open-safari" accessibilityRole="button"
              onPress={() => void openHttpsLink()} style={styles.browserLink}>
              <Text style={[styles.link, { color: colors.primary }]}>Open HTTPS Link in Safari</Text>
            </Pressable> : null}

            <Pressable testID="calendar-subscription-google" accessibilityRole="button"
              onPress={() => setShowGoogleInstructions((shown) => !shown)}
              style={[styles.secondaryButton, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="external-link" size={16} color={colors.primary} />
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Add to Google Calendar</Text>
              <Feather name={showGoogleInstructions ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
            </Pressable>
            {showGoogleInstructions ? <View style={[styles.googleSteps, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.stepText, { color: colors.foreground }]}>Google requires adding an external calendar from a desktop browser; the Android app cannot subscribe by URL.</Text>
              <Text style={[styles.stepText, { color: colors.foreground }]}>1. Copy the subscription link below.</Text>
              <Text style={[styles.stepText, { color: colors.foreground }]}>2. On a computer, open Google Calendar. Under “Other calendars,” choose “+” → “From URL,” paste the HTTPS link, then add the calendar.</Text>
              <Text style={[styles.stepText, { color: colors.foreground }]}>3. Use the same Google account as your Android phone, then enable this calendar’s visibility and sync on the device.</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Google Calendar may take several hours to refresh the feed.</Text>
            </View> : null}

            <Pressable testID="calendar-subscription-copy" accessibilityRole="button" onPress={() => void copyLink()}
              style={[styles.copyButton, { borderColor: colors.primary }]}>
              <Feather name="clipboard" size={15} color={colors.primary} />
              <Text style={[styles.copyButtonText, { color: colors.primary }]}>Copy Subscription Link</Text>
            </Pressable>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>You can also use this HTTPS link in another calendar app that supports URL subscriptions.</Text>

            {confirmRevoke ? <View style={[styles.revokeBox, { backgroundColor: colors.background, borderColor: colors.destructive }]}>
              <Text style={[styles.smallText, { color: colors.foreground }]}>Revoking stops future feed access. It does not remove the calendar from devices or erase events already cached by a provider.</Text>
              <View style={styles.revokeActions}>
                <Pressable testID="calendar-subscription-revoke-cancel" onPress={() => setConfirmRevoke(false)} style={styles.textAction}>
                  <Text style={[styles.link, { color: colors.foreground }]}>Keep Subscription</Text>
                </Pressable>
                <Pressable testID="calendar-subscription-revoke-confirm" onPress={revoke} disabled={revoking} style={styles.textAction}>
                  <Text style={[styles.link, { color: colors.destructive }]}>{revoking ? 'Revoking…' : 'Revoke Link'}</Text>
                </Pressable>
              </View>
            </View> : <Pressable testID="calendar-subscription-revoke" accessibilityRole="button" onPress={() => setConfirmRevoke(true)} style={styles.revokeButton}>
              <Feather name="x-circle" size={15} color={colors.destructive} />
              <Text style={[styles.revokeText, { color: colors.destructive }]}>Revoke Subscription</Text>
            </Pressable>}
          </> : null}

          {state.revokedAt && !state.active ? <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="alert-circle" size={15} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>The previous link is revoked. Creating a new subscription will generate a different link.</Text>
          </View> : null}
          {message ? <Text accessibilityLiveRegion="polite" testID="calendar-subscription-message"
            style={[styles.message, { color: message.startsWith('Could not') ? colors.destructive : colors.success }]}>{message}</Text> : null}
        </ScrollView> : null}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '94%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 18, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerCopy: { gap: 4 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 12, paddingBottom: 20 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 11, borderWidth: 1, borderRadius: 13 },
  noticeText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
  selectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 3 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  actionDivider: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  teamList: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  teamRow: { minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  teamLabel: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  primaryButton: { minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 2 },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  smallText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 3 },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  secondaryButtonText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  googleSteps: { borderWidth: 1, borderRadius: 12, padding: 11, gap: 8 },
  stepText: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
  copyButton: { minHeight: 42, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  copyButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  browserLink: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  revokeButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  revokeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  revokeBox: { borderWidth: 1, borderRadius: 13, padding: 11, gap: 10 },
  revokeActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  textAction: { paddingVertical: 4 },
  inlineError: { gap: 8, padding: 12, alignItems: 'center' },
  message: { fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
