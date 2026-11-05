import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Platform, ActivityIndicator } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListAdminAnnouncements, 
  useCreateAnnouncement, 
  useUpdateAnnouncement, 
  useRemoveAnnouncement,
  type Announcement,
  type AnnouncementAudienceTag,
  getListAdminAnnouncementsQueryKey,
  getListAnnouncementsQueryKey
} from '@workspace/api-client-react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RichTextEditor, type RichTextEditorRef } from './RichTextEditor';
import { tagLabel, type TagCatalog } from '@/constants/tagCatalog';
import { defaultScheduleDate, formatScheduleLabel, localDateString, localPartsToDate, localTimeString, mergeNativePick, scheduleProblem, timeZoneLabel, toUtcIso, type PublishMode } from '@/lib/announcementSchedule';

type ListFilter = 'all' | 'scheduled' | 'published';
const publicationOf = (a: Announcement) => a.publicationStatus ?? 'published';
const errorStatus = (error: unknown) => typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : 0;
const errorText = (error: unknown, fallback: string) => {
  const status = errorStatus(error);
  if (status === 404 || status === 409) return 'This announcement changed elsewhere (it may have already published or been removed). The list has been refreshed.';
  if (status === 403) return 'You do not have permission to do that.';
  const message = (error as { data?: { message?: string; error?: string } })?.data;
  return message?.message ?? message?.error ?? fallback;
};
const notify = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const audienceForRole = (role: string) => role === 'Parent-Athlete' ? 'Parent' : role === 'Athlete' ? 'Student' : role;
const roleForAudience = (audience: string) => audience === 'Parent' ? 'Parent-Athlete' : audience === 'Student' ? 'Athlete' : audience;

export function AdminAnnouncementsPanel({ colors, catalog }: { colors: any; catalog: TagCatalog }) {
  const queryClient = useQueryClient();
  const announcementsQuery = useListAdminAnnouncements({
    query: { queryKey: getListAdminAnnouncementsQueryKey(), refetchInterval: 30_000 }
  });
  
  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
  };
  const createMutation = useCreateAnnouncement({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        resetForm();
      },
      onError: (e) => { refreshLists(); notify('Error saving', errorText(e, e.message)); }
    }
  });

  const updateMutation = useUpdateAnnouncement({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        resetForm();
      },
      onError: (e) => { refreshLists(); notify('Error updating', errorText(e, e.message)); }
    }
  });

  const removeMutation = useRemoveAnnouncement({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
      },
      onError: (e) => { refreshLists(); notify('Error removing', errorText(e, e.message)); }
    }
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [durationDays, setDurationDays] = useState<string>('');
  const [audienceTags, setAudienceTags] = useState<AnnouncementAudienceTag[]>([]);
  const [teamTags, setTeamTags] = useState<string[]>([]);
  const richText = useRef<RichTextEditorRef>(null);
  
  const [formKey, setFormKey] = useState(0);
  const [publishMode, setPublishMode] = useState<PublishMode>('now');
  const initialSchedule = defaultScheduleDate();
  const [scheduleDate, setScheduleDate] = useState(localDateString(initialSchedule));
  const [scheduleTime, setScheduleTime] = useState(localTimeString(initialSchedule));
  const [scheduleError, setScheduleError] = useState('');
  const [editingPublication, setEditingPublication] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>('all');
  const scheduledDate = localPartsToDate(scheduleDate, scheduleTime);
  const setScheduleFrom = (date: Date) => { setScheduleDate(localDateString(date)); setScheduleTime(localTimeString(date)); setScheduleError(''); };
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);
  const pickerValue = scheduledDate ?? defaultScheduleDate();
  const applyNativePick = (mode: 'date' | 'time', eventType: string, picked?: Date) => {
    if (eventType !== 'set' || !picked) return;
    setScheduleFrom(mergeNativePick(pickerValue, picked, mode));
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDurationDays('');
    setAudienceTags([]);
    setTeamTags([]);
    setPublishMode('now');
    setScheduleFrom(defaultScheduleDate());
    setEditingPublication(null);
    richText.current?.setContentHTML('');
    setFormKey((k) => k + 1);
  };

  const editAnnouncement = (a: Announcement) => {
    setEditingId(a.id);
    setTitle(a.title);
    setDurationDays(a.durationDays ? String(a.durationDays) : '');
    setAudienceTags(a.audienceTags);
    setTeamTags(a.teamTags);
    setEditingPublication(publicationOf(a));
    if (publicationOf(a) === 'scheduled' && a.scheduledAt) {
      setPublishMode('later');
      setScheduleFrom(new Date(a.scheduledAt));
    } else setPublishMode('now');
    setFormKey((k) => k + 1);
    if (Platform.OS !== 'web') {
      setTimeout(() => {
        richText.current?.setContentHTML(a.body);
      }, 100);
    } else {
      setTimeout(() => {
        richText.current?.setContentHTML(a.body);
      }, 0);
    }
  };

  const removeAnnouncement = (id: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to remove this announcement?')) {
        removeMutation.mutate({ id });
      }
      return;
    }
    Alert.alert('Remove Announcement?', 'This will hide it from the public feed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate({ id }) }
    ]);
  };

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a title.');
      return;
    }
    if (audienceTags.length === 0) {
      Alert.alert('Missing Audience', 'Please select at least one audience.');
      return;
    }
    const html = await richText.current?.getContentHtml();
    if (!html || !html.trim() || html === '<br>') {
      Alert.alert('Missing Content', 'Please enter the announcement body.');
      return;
    }
    
    const canChooseTiming = !editingId || editingPublication !== 'published';
    let timing: { scheduledAt: string | null; publicationStatus: 'scheduled' | 'published' } | Record<string, never> = {};
    if (canChooseTiming) {
      if (publishMode === 'later') {
        const problem = scheduleProblem(scheduledDate);
        if (problem || !scheduledDate) { setScheduleError(problem ?? 'Choose a valid date and time.'); return; }
        timing = { scheduledAt: toUtcIso(scheduledDate), publicationStatus: 'scheduled' };
      } else timing = { scheduledAt: null, publicationStatus: 'published' };
    }
    setScheduleError('');
    const data = {
      title: title.trim(),
      body: html.trim(),
      durationDays: durationDays.trim() ? parseInt(durationDays, 10) : null,
      audienceTags,
      teamTags,
      ...timing,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  const postScheduledNow = (a: Announcement) => {
    const run = () => updateMutation.mutate({ id: a.id, data: {
      title: a.title, body: a.body, durationDays: a.durationDays, audienceTags: a.audienceTags, teamTags: a.teamTags,
      scheduledAt: null, publicationStatus: 'published',
    } });
    if (Platform.OS === 'web') { if (window.confirm(`Post "${a.title}" now? Its audience will be notified.`)) run(); return; }
    Alert.alert('Post now?', 'This publishes the announcement immediately and notifies its audience.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Post now', onPress: run },
    ]);
  };
  const allAnnouncements = announcementsQuery.data ?? [];
  const scheduledCount = allAnnouncements.filter((a) => publicationOf(a) === 'scheduled' && a.status !== 'removed').length;
  const announcements = allAnnouncements.filter((a) => filter === 'all' || (publicationOf(a) === filter && a.status !== 'removed'))
    .sort((a, b) => filter === 'scheduled' ? (Date.parse(a.scheduledAt ?? '') || 0) - (Date.parse(b.scheduledAt ?? '') || 0) : 0);
  // If another admin publishes/removes the one being edited, leave scheduling mode safely.
  const editingCurrent = editingId ? allAnnouncements.find((a) => a.id === editingId) : undefined;
  useEffect(() => {
    if (editingId && editingCurrent && editingPublication === 'scheduled' && publicationOf(editingCurrent) !== 'scheduled') {
      setEditingPublication(publicationOf(editingCurrent));
      notify('Announcement already published', 'This scheduled announcement was published while you were editing. Saving will update the live announcement.');
    }
  }, [editingId, editingCurrent?.publicationStatus]);
  const timingVisible = !editingId || editingPublication !== 'published';
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Announcements</Text>
          <Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>
            Create and manage public announcements for the dashboard.
          </Text>
        </View>
      </View>

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>
              {editingId ? 'Edit Announcement' : 'Post Announcement'}
            </Text>
          </View>
          {editingId ? (
            <Pressable onPress={resetForm}>
              <Text style={[styles.cancel, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Announcement Title"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
        />

        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ROLE TAG</Text>
        <View style={styles.audienceGrid}>
          {catalog.roles.map((role) => {
            const tag = audienceForRole(role.id);
            const selected = audienceTags.includes(tag);
            return (
              <Pressable
                testID={`announcement-role-${role.id}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                key={role.id}
                onPress={() => {
                  setAudienceTags(prev => 
                    selected ? prev.filter(t => t !== tag) : [...prev, tag]
                  );
                }}
                style={[
                  styles.audiencePill,
                  { 
                    backgroundColor: selected ? colors.primary : colors.background,
                    borderColor: selected ? colors.primary : colors.border
                  }
                ]}
              >
                <Text style={[styles.audienceText, { color: selected ? '#fff' : colors.foreground }]}>
                  {role.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TEAM TAG · OPTIONAL</Text>
        <Text style={[styles.fieldHelp, { color: colors.mutedForeground }]}>Leave all teams unselected to send to every team in the chosen roles.</Text>
        <View style={styles.audienceGrid}>
          {catalog.teams.map((team) => {
            const selected = teamTags.includes(team.id);
            return (
              <Pressable
                testID={`announcement-team-${team.id}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                key={team.id}
                onPress={() => setTeamTags((current) => selected ? current.filter((id) => id !== team.id) : [...current, team.id])}
                style={[
                  styles.audiencePill,
                  { backgroundColor: selected ? colors.primary : colors.background, borderColor: selected ? colors.primary : colors.border },
                ]}
              >
                <Text style={[styles.audienceText, { color: selected ? '#fff' : colors.foreground }]}>{team.label}</Text>
              </Pressable>
            );
          })}
        </View>
        
        <View style={[styles.editorContainer, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <RichTextEditor
             formKey={formKey}
             editorRef={richText}
             hideToolbar
             initialContent={editingId ? allAnnouncements.find(a => a.id === editingId)?.body : undefined}
          />
        </View>

        <TextInput
          value={durationDays}
          onChangeText={setDurationDays}
          placeholder="Duration (days) — optional"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="number-pad"
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
        />

        {timingVisible ? <View testID="announcement-timing">
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>WHEN TO POST</Text>
          <View style={styles.segment}>
            {([['now', 'Post now', 'send'], ['later', 'Schedule for later', 'clock']] as [PublishMode, string, 'send' | 'clock'][]).map(([mode, label, icon]) => {
              const selected = publishMode === mode;
              return <Pressable key={mode} testID={`announcement-mode-${mode}`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { setPublishMode(mode); setScheduleError(''); }} style={[styles.segmentItem, { backgroundColor: selected ? colors.primary : colors.background, borderColor: selected ? colors.primary : colors.border }]}>
                <Feather name={icon} size={14} color={selected ? '#fff' : colors.foreground} />
                <Text style={[styles.audienceText, { color: selected ? '#fff' : colors.foreground }]}>{label}</Text>
              </Pressable>;
            })}
          </View>
          {publishMode === 'later' ? <View style={[styles.scheduleBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
            {Platform.OS === 'web' ? <View style={styles.webPickers}>
              <View style={{ flex: 1, gap: 4 }}><Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>Date</Text>
                {React.createElement('input', { type: 'date', 'data-testid': 'announcement-schedule-date', value: scheduleDate, min: localDateString(new Date()), onChange: (e: { target: { value: string } }) => { setScheduleDate(e.target.value); setScheduleError(''); }, style: { height: 40, borderRadius: 10, border: `1px solid ${colors.border}`, padding: '0 10px', fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.foreground, background: colors.card } })}
              </View>
              <View style={{ flex: 1, gap: 4 }}><Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>Time ({timeZoneLabel(scheduledDate ?? new Date())})</Text>
                {React.createElement('input', { type: 'time', 'data-testid': 'announcement-schedule-time', value: scheduleTime, step: 60, onChange: (e: { target: { value: string } }) => { setScheduleTime(e.target.value); setScheduleError(''); }, style: { height: 40, borderRadius: 10, border: `1px solid ${colors.border}`, padding: '0 10px', fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.foreground, background: colors.card } })}
              </View>
            </View> : <View style={{ gap: 10 }}>
              {(['date', 'time'] as const).map((mode) => <View key={mode} style={styles.stepperRow}>
                <Text style={[styles.pickerLabel, { color: colors.mutedForeground, width: 96 }]}>{mode === 'date' ? 'Date' : `Time (${timeZoneLabel(pickerValue)})`}</Text>
                {Platform.OS === 'ios' ? <View style={{ flex: 1, alignItems: 'flex-start' }}>
                  <DateTimePicker testID={`announcement-schedule-${mode}`} value={pickerValue} mode={mode} display="compact" minimumDate={mode === 'date' ? new Date() : undefined} accentColor={colors.primary} onChange={(event, date) => applyNativePick(mode, event.type, date)} />
                </View> : <Pressable testID={`announcement-schedule-${mode}`} accessibilityRole="button" accessibilityLabel={mode === 'date' ? 'Choose date' : 'Choose time'} onPress={() => setAndroidPicker(mode)} style={[styles.nativePickerButton, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Feather name={mode === 'date' ? 'calendar' : 'clock'} size={15} color={colors.primary} />
                  <Text style={[styles.stepperValue, { color: colors.foreground, textAlign: 'left' }]}>{mode === 'date'
                    ? pickerValue.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                    : pickerValue.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
                </Pressable>}
              </View>)}
              {Platform.OS === 'android' && androidPicker ? <DateTimePicker value={pickerValue} mode={androidPicker} display="default" minimumDate={androidPicker === 'date' ? new Date() : undefined} onChange={(event, date) => { const mode = androidPicker; setAndroidPicker(null); applyNativePick(mode, event.type, date); }} /> : null}
            </View>}
            <Text testID="announcement-schedule-summary" style={[styles.scheduleSummary, { color: colors.foreground }]}>{scheduledDate ? `Scheduled for ${formatScheduleLabel(scheduledDate)}` : 'Choose a valid date and time.'}</Text>
            <Text style={[styles.fieldHelp, { color: colors.mutedForeground, marginTop: 2, marginBottom: 0 }]}>Shown in your local time zone. Members see it only once it publishes.</Text>
          </View> : null}
          {scheduleError ? <Text testID="announcement-schedule-error" accessibilityRole="alert" style={[styles.fieldHelp, { color: colors.destructive, marginTop: 0 }]}>{scheduleError}</Text> : null}
        </View> : null}

        <Pressable 
          disabled={isSaving}
          onPress={save} 
          style={[styles.saveButton, { backgroundColor: colors.primary, opacity: isSaving ? 0.7 : 1 }]}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{timingVisible && publishMode === 'later'
              ? (editingId && editingPublication === 'scheduled' ? 'Update Schedule' : 'Schedule Announcement')
              : editingId ? (editingPublication === 'scheduled' ? 'Post Now' : 'Update Announcement') : 'Post Announcement'}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {([['all', 'All'], ['scheduled', `Scheduled${scheduledCount ? ` · ${scheduledCount}` : ''}`], ['published', 'Published']] as [ListFilter, string][]).map(([value, label]) => <Pressable key={value} testID={`announcement-filter-${value}`} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.audiencePill, { backgroundColor: filter === value ? colors.foreground : colors.card, borderColor: colors.border }]}>
          <Text style={[styles.audienceText, { color: filter === value ? colors.background : colors.mutedForeground }]}>{label}</Text>
        </Pressable>)}
      </View>
      {announcementsQuery.isError ? <Pressable onPress={() => void announcementsQuery.refetch()} style={{ paddingHorizontal: 22 }}><Text style={[styles.fieldHelp, { color: colors.destructive }]}>Announcements could not load. Tap to retry.</Text></Pressable> : null}
      {!announcementsQuery.isLoading && !announcementsQuery.isError && announcements.length === 0 ? <View style={{ alignItems: 'center', paddingVertical: 28, gap: 6 }}>
        <Feather name={filter === 'scheduled' ? 'clock' : 'bell'} size={22} color={colors.mutedForeground} />
        <Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>{filter === 'scheduled' ? 'Nothing scheduled. Choose "Schedule for later" above.' : 'No announcements yet.'}</Text>
      </View> : null}
      {announcementsQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 34 }} />
      ) : (
        <View style={styles.list}>
          {announcements.map((a) => { const scheduled = publicationOf(a) === 'scheduled'; const draft = publicationOf(a) === 'draft'; return (
            <View key={a.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{a.title}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {scheduled || draft ? <View style={[styles.statusBadge, { backgroundColor: `${colors.primary}1f` }]}>
                    <Text style={[styles.statusText, { color: colors.primary }]}>{scheduled ? 'SCHEDULED' : 'DRAFT'}</Text>
                  </View> : null}
                  {!scheduled || a.status === 'removed' ? <View style={[styles.statusBadge, { backgroundColor: a.status === 'active' ? '#10b98122' : a.status === 'removed' ? '#ef444422' : '#f59e0b22' }]}>
                    <Text style={[styles.statusText, { color: a.status === 'active' ? '#10b981' : a.status === 'removed' ? '#ef4444' : '#f59e0b' }]}>
                      {a.status.toUpperCase()}
                    </Text>
                  </View> : null}
                </View>
              </View>
              {scheduled ? <View style={styles.scheduledLine}><Feather name="clock" size={13} color={colors.primary} /><Text style={[styles.scheduledText, { color: colors.primary }]}>{a.scheduledAt ? `Scheduled for ${formatScheduleLabel(a.scheduledAt)}` : 'Scheduled'}</Text></View> : null}
              <Text style={[styles.cardMeta, { color: colors.mutedForeground, marginBottom: 4 }]}>By {a.creatorName || 'Unknown'}</Text>
              <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
                {scheduled || draft || !a.publishedAt ? 'Not yet published' : new Date(a.publishedAt).toLocaleDateString()} · {a.audienceTags.map((tag) => tagLabel(catalog, 'roles', roleForAudience(tag))).join(', ')}
                {a.teamTags.length ? ` · ${a.teamTags.map((team) => tagLabel(catalog, 'team', team)).join(', ')}` : ' · All teams'} ·{' '}
                {a.status === 'expired'
                  ? 'Expired' 
                  : scheduled ? (a.durationDays ? `Runs ${a.durationDays} days after publishing` : 'No expiration')
                  : a.expiresAt 
                    ? `${Math.max(0, Math.ceil((new Date(a.expiresAt).getTime() - Date.now()) / 86400000))} days remaining`
                    : 'No expiration'}
              </Text>
              
              <View style={styles.cardActions}>
                <Pressable testID={`announcement-edit-${a.id}`} onPress={() => editAnnouncement(a)} style={styles.actionBtn}>
                  <Feather name={scheduled ? 'calendar' : 'edit-2'} size={15} color={colors.primary} />
                  <Text style={[styles.actionText, { color: colors.primary }]}>{scheduled ? 'Edit / reschedule' : 'Edit'}</Text>
                </Pressable>
                {scheduled && a.status !== 'removed' ? <Pressable testID={`announcement-post-now-${a.id}`} disabled={updateMutation.isPending} onPress={() => postScheduledNow(a)} style={styles.actionBtn}>
                  <Feather name="send" size={15} color={colors.primary} />
                  <Text style={[styles.actionText, { color: colors.primary }]}>Post now</Text>
                </Pressable> : null}
                {a.status !== 'removed' && (
                  <Pressable onPress={() => removeAnnouncement(a.id)} style={styles.actionBtn}>
                    <Feather name="trash-2" size={15} color={colors.destructive} />
                    <Text style={[styles.actionText, { color: colors.destructive }]}>{scheduled ? 'Delete' : 'Remove'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ); })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    marginBottom: 20,
  },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.5 },
  sectionCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 4 },
  panel: { marginHorizontal: 18, borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 24 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  panelTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  cancel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginBottom: 14,
  },
  audienceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 8,
  },
  fieldHelp: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: -3,
    marginBottom: 9,
  },
  audiencePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  audienceText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  editorContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 200,
    marginBottom: 14,
  },
  toolbar: {
    borderBottomWidth: 1,
  },
  editor: {
    flex: 1,
    minHeight: 150,
  },
  saveButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 18,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  cardMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginBottom: 14,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  segmentItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  scheduleBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12, gap: 8 },
  webPickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pickerLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  nativePickerButton: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleSummary: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 4 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, marginBottom: 12 },
  scheduledLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  scheduledText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  }
});
