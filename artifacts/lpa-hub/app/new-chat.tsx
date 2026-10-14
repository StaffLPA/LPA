import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CachedImage as Image } from '@/components/CachedImage';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch, useCreateChat } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { teamMatches } from '@/constants/tagCatalog';
import { useTagCatalog } from '@/hooks/useTagCatalog';

type Member = { id: string; fullName: string; role: string; status: string; teams: string[]; profilePhotoUri?: string | null };
type ChatMode = 'direct' | 'group';

export default function NewChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useApp();
  const tagCatalog = useTagCatalog();
  const canCreateGroup = user?.role === 'Admin' || user?.role === 'Staff-Coach';
  const [people, setPeople] = useState<Member[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState(false);
  const createChat = useCreateChat();
  const [mode, setMode] = useState<ChatMode>('direct');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  useEffect(() => {
    let mounted = true;
    setPeopleLoading(true);
    void customFetch<Member[]>('/api/users', { responseType: 'json' })
      .then((users) => {
        if (mounted) {
          const uniqueUsers = Array.from(new Map(users.map((person) => [person.id, person])).values());
          setPeople(uniqueUsers);
          setPeopleError(false);
        }
      })
      .catch(() => { if (mounted) setPeopleError(true); })
      .finally(() => { if (mounted) setPeopleLoading(false); });
    return () => { mounted = false; };
  }, []);
  const members = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return people.filter((person) => {
      if (person.id === user?.id || !person.fullName.toLocaleLowerCase().includes(normalizedQuery)) return false;
      if (mode === 'group') {
        if (person.status !== 'active') return false;
        if (selectedTeams.length && !person.teams.some((team) => selectedTeams.some((selectedTeam) => teamMatches(tagCatalog.data, team, selectedTeam)))) return false;
      }
      return true;
    });
  }, [mode, people, query, selectedTeams, tagCatalog.data, user?.id]);
  const toggle = (id: string) => setSelected((items) => {
    if (mode === 'direct') return items.includes(id) ? [] : [id];
    return items.includes(id) ? items.filter((item) => item !== id) : Array.from(new Set([...items, id]));
  });
  const toggleTeam = (id: string) => setSelectedTeams((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const changeMode = (nextMode: ChatMode) => {
    setMode(nextMode);
    setSelected([]);
    setQuery('');
  };
  const canSubmit = mode === 'direct' ? selected.length === 1 : canCreateGroup && !!groupName.trim() && selected.length > 0;
  const submit = () => {
    if (!canSubmit || createChat.isPending) return;
    const userIds = Array.from(new Set(selected));
    const data = mode === 'group'
      ? { type: 'group' as const, name: groupName.trim(), userIds }
      : { type: 'direct' as const, userIds };
    createChat.mutate({ data }, { onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      router.replace(('/chat/' + conversation.id) as never);
    } });
  };
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={{ paddingTop: insets.top + 13 }}><View style={styles.header}><Pressable onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>{mode === 'group' ? 'New group' : 'New message'}</Text><Pressable disabled={!canSubmit || createChat.isPending} onPress={submit}><Text style={[styles.done, { color: canSubmit ? colors.accent : colors.mutedForeground }]}>{createChat.isPending ? 'Creating…' : mode === 'group' ? 'Create' : 'Message'}</Text></Pressable></View><Text style={[styles.copy, { color: colors.mutedForeground }]}>{mode === 'group' ? 'Create a shared conversation with active LPA members.' : 'Start a private direct message with any active LPA member.'}</Text></View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 30 }}>
      {canCreateGroup ? <View style={styles.modeTabs}>
        {(['direct', 'group'] as const).map((option) => <Pressable key={option} testID={`chat-mode-${option}`} onPress={() => changeMode(option)} style={[styles.modeTab, { backgroundColor: mode === option ? colors.primary : colors.card, borderColor: mode === option ? colors.primary : colors.border }]}><Text style={[styles.modeTabText, { color: mode === option ? '#fff' : colors.foreground }]}>{option === 'direct' ? 'Direct message' : 'Group chat'}</Text></Pressable>)}
      </View> : null}
      {mode === 'group' ? <>
        <Text style={[styles.label, { color: colors.foreground }]}>Group name</Text>
        <TextInput testID="group-chat-name" value={groupName} onChangeText={setGroupName} placeholder="Name this conversation" placeholderTextColor={colors.mutedForeground} maxLength={100} style={[styles.nameInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Filter by team</Text>
        {tagCatalog.isError ? <Text style={[styles.failure, { color: colors.primary }]}>Team filters could not load. Please try again.</Text> : null}
        <View style={styles.teamChips}>{tagCatalog.data.teams.map((team) => {
          const active = selectedTeams.includes(team.id);
          return <Pressable key={team.id} testID={`team-filter-${team.id}`} onPress={() => toggleTeam(team.id)} style={[styles.teamChip, { backgroundColor: active ? `${colors.primary}18` : colors.card, borderColor: active ? colors.primary : colors.border }]}><Text style={[styles.teamChipText, { color: active ? colors.primary : colors.foreground }]}>{team.label}</Text>{active ? <Feather name="check" size={13} color={colors.primary} /> : null}</Pressable>;
        })}</View>
      </> : null}
      <View style={styles.searchLabelRow}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{mode === 'group' ? 'Choose members' : 'Choose one person'}</Text><Text style={[styles.selectedCount, { color: colors.mutedForeground }]}>{selected.length} selected</Text></View>
       {mode === 'group' && selected.length ? <View style={styles.selectedPeople}>{people.filter((person) => selected.includes(person.id)).map((person) => <Pressable key={person.id} testID={`remove-selected-${person.id}`} onPress={() => toggle(person.id)} style={[styles.selectedPerson, { backgroundColor: `${colors.primary}18` }]}>{person.profilePhotoUri ? <Image source={{ uri: person.profilePhotoUri }} accessibilityLabel={`${person.fullName} profile picture`} style={styles.selectedPersonPhoto} /> : <View style={[styles.selectedPersonPhoto, styles.selectedPersonInitials, { backgroundColor: `${colors.primary}20` }]}><Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 8 }}>{person.fullName.trim().charAt(0).toUpperCase()}</Text></View>}<Text style={[styles.selectedPersonText, { color: colors.primary }]}>{person.fullName}</Text><Feather name="x" size={13} color={colors.primary} /></Pressable>)}</View> : null}
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={16} color={colors.mutedForeground} /><TextInput value={query} onChangeText={setQuery} placeholder="Search active members" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View>
       {peopleLoading ? <ActivityIndicator color={colors.primary} /> : peopleError ? <Text style={[styles.failure, { color: colors.primary }]}>People could not load. Please try again.</Text> : members.map((person) => <Pressable key={person.id} testID={`chat-member-${person.id}`} onPress={() => toggle(person.id)} style={[styles.member, { backgroundColor: colors.card, borderColor: selected.includes(person.id) ? colors.primary : colors.border }]}><View style={[styles.memberIcon, { backgroundColor: `${colors.primary}20` }]}>{mode === 'group' && person.profilePhotoUri ? <Image source={{ uri: person.profilePhotoUri }} accessibilityLabel={`${person.fullName} profile picture`} resizeMode="cover" style={styles.memberPhoto} /> : <Text style={[styles.memberInitials, { color: colors.primary }]}>{person.fullName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text>}</View><View style={{ flex: 1 }}><Text style={[styles.memberName, { color: colors.foreground }]}>{person.fullName}</Text><Text style={[styles.memberMeta, { color: colors.mutedForeground }]}>{person.role} · {person.teams.join(', ') || 'LPA'}</Text></View><View style={[styles.check, { borderColor: selected.includes(person.id) ? colors.primary : colors.border, backgroundColor: selected.includes(person.id) ? colors.primary : 'transparent' }]}>{selected.includes(person.id) ? <Feather name="check" size={13} color="#fff" /> : null}</View></Pressable>)}
      {!peopleLoading && !peopleError && members.length === 0 ? <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{mode === 'group' && selectedTeams.length ? 'No active members match the selected teams and search.' : 'No members match your search.'}</Text> : null}
      {mode === 'group' ? <Pressable testID="create-group-chat" disabled={!canSubmit || createChat.isPending} onPress={submit} style={[styles.createButton, { backgroundColor: canSubmit ? colors.primary : colors.muted }]}>{createChat.isPending ? <ActivityIndicator color="#fff" /> : <><Text style={styles.createButtonText}>Create group chat</Text><Feather name="message-square" size={16} color="#fff" /></>}</Pressable> : null}
      {createChat.isError ? <Text style={[styles.failure, { color: colors.primary }]}>Could not create the conversation. Please try again.</Text> : null}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { height: 47, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  done: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  copy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginHorizontal: 22, marginTop: 15, marginBottom: 15 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 8, marginTop: 9 },
  nameInput: { height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 6 },
  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 15 },
  modeTab: { flex: 1, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modeTabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  teamChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  teamChip: { minHeight: 34, borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  teamChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  searchLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedCount: { fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 11 },
  selectedPeople: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  selectedPerson: { minHeight: 28, borderRadius: 15, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  selectedPersonText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  selectedPersonPhoto: { width: 18, height: 18, borderRadius: 9 },
  selectedPersonInitials: { alignItems: 'center', justifyContent: 'center' },
  search: { height: 43, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 17 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 11 },
  member: { minHeight: 66, borderWidth: 1, borderRadius: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11 },
  memberIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  memberPhoto: { width: 38, height: 38, borderRadius: 13 },
  memberInitials: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  memberName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 4 },
  memberMeta: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  check: { width: 21, height: 21, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  createButton: { minHeight: 46, borderRadius: 14, paddingHorizontal: 15, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  createButtonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginVertical: 16 },
  failure: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'center', marginTop: 12 },
});