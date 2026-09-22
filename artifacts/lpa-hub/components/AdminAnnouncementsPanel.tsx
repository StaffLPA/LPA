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
import { RichTextEditor, type RichTextEditorRef } from './RichTextEditor';

const AUDIENCES: AnnouncementAudienceTag[] = ['Staff-Coach', 'Parent', 'Student'];

export function AdminAnnouncementsPanel({ colors }: { colors: any }) {
  const queryClient = useQueryClient();
  const announcementsQuery = useListAdminAnnouncements({
    query: { queryKey: getListAdminAnnouncementsQueryKey() }
  });
  
  const createMutation = useCreateAnnouncement({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        resetForm();
      },
      onError: (e) => Alert.alert('Error saving', e.message)
    }
  });

  const updateMutation = useUpdateAnnouncement({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        resetForm();
      },
      onError: (e) => Alert.alert('Error updating', e.message)
    }
  });

  const removeMutation = useRemoveAnnouncement({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
      },
      onError: (e) => Alert.alert('Error removing', e.message)
    }
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [durationDays, setDurationDays] = useState<string>('');
  const [audienceTags, setAudienceTags] = useState<AnnouncementAudienceTag[]>([]);
  const richText = useRef<RichTextEditorRef>(null);
  
  const [formKey, setFormKey] = useState(0);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDurationDays('');
    setAudienceTags([]);
    richText.current?.setContentHTML('');
    setFormKey((k) => k + 1);
  };

  const editAnnouncement = (a: Announcement) => {
    setEditingId(a.id);
    setTitle(a.title);
    setDurationDays(a.durationDays ? String(a.durationDays) : '');
    setAudienceTags(a.audienceTags);
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
    
    const data = {
      title: title.trim(),
      body: html.trim(),
      durationDays: durationDays.trim() ? parseInt(durationDays, 10) : null,
      audienceTags
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  const announcements = announcementsQuery.data ?? [];
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

        <View style={styles.audienceGrid}>
          {AUDIENCES.map((tag) => {
            const selected = audienceTags.includes(tag);
            return (
              <Pressable
                key={tag}
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
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </View>
        
        <View style={[styles.editorContainer, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <RichTextEditor
             formKey={formKey}
             editorRef={richText}
             initialContent={editingId ? announcements.find(a => a.id === editingId)?.body : undefined}
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

        <Pressable 
          disabled={isSaving}
          onPress={save} 
          style={[styles.saveButton, { backgroundColor: colors.primary, opacity: isSaving ? 0.7 : 1 }]}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{editingId ? 'Update Announcement' : 'Post Announcement'}</Text>
          )}
        </Pressable>
      </View>

      {announcementsQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 34 }} />
      ) : (
        <View style={styles.list}>
          {announcements.map((a) => (
            <View key={a.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{a.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: a.status === 'active' ? '#10b98122' : a.status === 'removed' ? '#ef444422' : '#f59e0b22' }]}>
                  <Text style={[styles.statusText, { color: a.status === 'active' ? '#10b981' : a.status === 'removed' ? '#ef4444' : '#f59e0b' }]}>
                    {a.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
                {new Date(a.publishedAt).toLocaleDateString()} · {a.audienceTags.join(', ')} ·{' '}
                {a.status === 'expired' 
                  ? 'Expired' 
                  : a.expiresAt 
                    ? `${Math.max(0, Math.ceil((new Date(a.expiresAt).getTime() - Date.now()) / 86400000))} days remaining`
                    : 'No expiration'}
              </Text>
              
              <View style={styles.cardActions}>
                <Pressable onPress={() => editAnnouncement(a)} style={styles.actionBtn}>
                  <Feather name="edit-2" size={15} color={colors.primary} />
                  <Text style={[styles.actionText, { color: colors.primary }]}>Edit</Text>
                </Pressable>
                {a.status !== 'removed' && (
                  <Pressable onPress={() => removeAnnouncement(a.id)} style={styles.actionBtn}>
                    <Feather name="trash-2" size={15} color={colors.destructive} />
                    <Text style={[styles.actionText, { color: colors.destructive }]}>Remove</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
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
    gap: 16,
  },
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
