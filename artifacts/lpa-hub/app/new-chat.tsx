import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch, useCreateChat } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';

type Member = { id: string; fullName: string; role: string; status: string; teams: string[] };
type ChatType = 'direct' | 'channel' | 'group';

export default function NewChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useApp();
  const [people, setPeople] = useState<Member[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState(false);
  const createChat = useCreateChat();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    let mounted = true;
    setPeopleLoading(true);
    void customFetch<Member[]>('/api/users', { responseType: 'json' })
      .then((users) => { if (mounted) { setPeople(users); setPeopleError(false); } })
      .catch(() => { if (mounted) setPeopleError(true); })
      .finally(() => { if (mounted) setPeopleLoading(false); });
    return () => { mounted = false; };
  }, []);
  const members = useMemo(() => people.filter((person) => person.id !== user?.id && person.fullName.toLowerCase().includes(query.toLowerCase())), [people, query, user?.id]);
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? [] : [id]);
  const canSubmit = selected.length === 1;
  const submit = () => {
    if (!canSubmit || createChat.isPending) return;
    const data = { type: 'direct' as const, userIds: selected };
    createChat.mutate({ data }, { onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      router.replace(('/chat/' + conversation.id) as never);
    } });
  };
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={{ paddingTop: insets.top + 13 }}><View style={styles.header}><Pressable onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>New message</Text><Pressable disabled={!canSubmit || createChat.isPending} onPress={submit}><Text style={[styles.done, { color: canSubmit ? colors.accent : colors.mutedForeground }]}>{createChat.isPending ? 'Opening…' : 'Message'}</Text></Pressable></View><Text style={[styles.copy, { color: colors.mutedForeground }]}>Start a private direct message with any active LPA Hub member.</Text></View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 30 }}>
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={16} color={colors.mutedForeground} /><TextInput value={query} onChangeText={setQuery} placeholder="Search active members" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{selected.length ? '1 person selected' : 'Choose one person'}</Text>
       {peopleLoading ? <ActivityIndicator color={colors.primary} /> : peopleError ? <Text style={[styles.failure, { color: colors.primary }]}>People could not load. Please try again.</Text> : members.map((person) => <Pressable key={person.id} onPress={() => toggle(person.id)} style={[styles.member, { backgroundColor: colors.card, borderColor: selected.includes(person.id) ? colors.primary : colors.border }]}><View style={[styles.memberIcon, { backgroundColor: `${colors.primary}20` }]}><Text style={[styles.memberInitials, { color: colors.primary }]}>{person.fullName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text></View><View style={{ flex: 1 }}><Text style={[styles.memberName, { color: colors.foreground }]}>{person.fullName}</Text><Text style={[styles.memberMeta, { color: colors.mutedForeground }]}>{person.role} · {person.teams.join(', ') || 'LPA'}</Text></View><View style={[styles.check, { borderColor: selected.includes(person.id) ? colors.primary : colors.border, backgroundColor: selected.includes(person.id) ? colors.primary : 'transparent' }]}>{selected.includes(person.id) ? <Feather name="check" size={13} color="#fff" /> : null}</View></Pressable>)}
      {createChat.isError ? <Text style={[styles.failure, { color: colors.primary }]}>Could not create the conversation. Please try again.</Text> : null}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { height: 47, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontFamily: 'Inter_700Bold', fontSize: 17 }, done: { fontFamily: 'Inter_700Bold', fontSize: 13 }, copy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginHorizontal: 22, marginTop: 15, marginBottom: 15 }, label: { fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 8, marginTop: 9 }, nameInput: { height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 13 }, types: { flexDirection: 'row', gap: 8, marginBottom: 14 }, type: { flex: 1, height: 43, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, search: { height: 43, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 17 }, searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12 }, sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 11 }, member: { minHeight: 66, borderWidth: 1, borderRadius: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11 }, memberIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, memberInitials: { fontFamily: 'Inter_700Bold', fontSize: 11 }, memberName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 4 }, memberMeta: { fontFamily: 'Inter_400Regular', fontSize: 10 }, check: { width: 21, height: 21, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', paddingTop: 60, gap: 9, paddingHorizontal: 35 }, emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 4 }, failure: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'center', marginTop: 12 },
});