import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { teamEventAliases } from '@/constants/teams';

const contacts = [
  { name: 'Mark Karaviotis', role: 'Head Coach', email: 'mark@legendaryprepacademy.com', phone: '602-905-9164', initials: 'MK', tint: '#AB562B', photo: require('../../assets/staff-mark-karaviotis-face.jpg') },
  { name: 'Taylor Hubbell', role: 'Middle School Head Coach', email: 'taylor@legendaryprepacademy.com', phone: '480-462-1471', initials: 'TH', tint: '#9BC7BD', photo: require('../../assets/staff-taylor-hubbell-face.jpg') },
  { name: 'Terrell Hudson', role: 'Assistant Coach', email: 'terrell@legendaryprepacademy.com', phone: '623-267-3533', initials: 'TH', tint: '#C88A62', photo: require('../../assets/staff-terrell-hudson-face.jpg') },
  { name: 'Joe Dunigan', role: 'Hitting Coordinator', email: 'joe@legendaryprepacademy.com', phone: undefined, initials: 'JD', tint: '#C89A62', photo: require('../../assets/staff-joe-dunigan-face.jpg') },
  { name: 'Josh Garcia', role: 'Director of Strength & Conditioning', email: 'josh@legendaryprepacademy.com', phone: undefined, initials: 'JG', tint: '#9BC7BD', photo: require('../../assets/staff-josh-garcia-face.jpg') },
  { name: 'Martin Jacquez', role: 'Academic Advisor', email: 'martin@legendaryprepacademy.com', phone: undefined, initials: 'MJ', tint: '#AB562B', photo: require('../../assets/staff-martin-jacquez-face.jpg') },
  { name: 'Vinna', role: 'Physical Therapy', email: 'contact@teamvinna.com', phone: '480-269-1184', website: 'https://www.teamvinna.com/', initials: 'VI', tint: '#9BC7BD', partner: true, logo: require('../../assets/vinna.png'), logoKind: 'vinna' },
  { name: 'Between the Lines', role: 'Contact Us · Partner', email: undefined, phone: '480-656-9959', website: 'https://www.betweenthelinesaz.com/', initials: 'BT', tint: '#C88A62', partner: true, logo: require('../../assets/between-the-lines.png'), logoKind: 'between' },
  { name: 'EdOptions', role: 'Partner · Charles Tack', email: 'ctack@educationaloptionsfoundation.org', phone: '602-741-3999', website: 'https://eohighschool.com/', initials: 'EO', tint: '#AB562B', partner: true, logo: require('../../assets/edoptions.jpg'), logoKind: 'edoptions' },
];

type Contact = (typeof contacts)[number];
type RosterTeam = '14u' | '15u' | 'Junior Varsity' | 'Varsity';
type RosterMember = { id: string; fullName: string; role: string; status: string; teams: string[]; profilePhotoUri?: string | null };
const rosterTeams: RosterTeam[] = ['14u', '15u', 'Junior Varsity', 'Varsity'];
const rosterTeamAliases: Record<RosterTeam, string[]> = {
  '14u': teamEventAliases['LPA 14U'],
  '15u': teamEventAliases['LPA 15U'],
  'Junior Varsity': teamEventAliases['LPA JV'],
  Varsity: teamEventAliases['LPA Varsity'],
};

function ContactCard({ contact, colors }: { contact: Contact; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.contact, { backgroundColor: colors.card, borderColor: colors.border }]}>
    {contact.photo ? <Image source={contact.photo} accessibilityLabel={`${contact.name} profile photo`} resizeMode="cover" style={styles.contactPhoto} /> : contact.logo ? <View style={[styles.partnerLogoBox, { backgroundColor: contact.logoKind === 'vinna' ? '#101010' : '#FFFFFF' }]}><Image source={contact.logo} accessibilityLabel={`${contact.name} logo`} resizeMode="contain" style={[styles.partnerLogo, contact.logoKind === 'vinna' ? styles.vinnaLogo : contact.logoKind === 'between' ? styles.betweenTheLinesLogo : styles.edOptionsLogo]} /></View> : <View style={[styles.contactAvatar, { backgroundColor: `${contact.tint}20` }]}><Text style={[styles.contactInitials, { color: contact.tint }]}>{contact.initials}</Text></View>}
    <View style={{ flex: 1 }}><Text style={[styles.contactName, { color: colors.foreground }]}>{contact.name}</Text><Text style={[styles.contactRole, { color: colors.mutedForeground }]}>{contact.role}</Text></View>
    <View style={styles.contactActions}>
      {contact.email ? <Pressable accessibilityLabel={`Email ${contact.name}`} onPress={() => void Linking.openURL(`mailto:${contact.email}`)}><Feather name="mail" size={17} color={colors.primary} /></Pressable> : null}
      {contact.phone ? <Pressable accessibilityLabel={`Call ${contact.name}`} onPress={() => void Linking.openURL(`tel:${contact.phone}`)}><Feather name="phone" size={17} color={colors.primary} /></Pressable> : null}
      {contact.website ? <Pressable accessibilityLabel={`Open ${contact.name} website`} onPress={() => void Linking.openURL(contact.website)}><Feather name="external-link" size={17} color={colors.primary} /></Pressable> : null}
    </View>
  </View>;
}

function RosterCard({ member, colors }: { member: RosterMember; colors: ReturnType<typeof useColors> }) {
  const initials = member.fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <View style={[styles.contact, { backgroundColor: colors.card, borderColor: colors.border }]}>
    {member.profilePhotoUri ? <Image source={{ uri: member.profilePhotoUri }} accessibilityLabel={`${member.fullName} profile photo`} resizeMode="cover" style={styles.contactPhoto} /> : <View style={[styles.contactAvatar, { backgroundColor: `${colors.primary}20` }]}><Text style={[styles.contactInitials, { color: colors.primary }]}>{initials}</Text></View>}
    <View style={{ flex: 1 }}><Text style={[styles.contactName, { color: colors.foreground }]}>{member.fullName}</Text><Text style={[styles.contactRole, { color: colors.mutedForeground }]}>{member.role}</Text></View><Text style={[styles.status, { color: member.status === 'invited' ? colors.primary : colors.accent }]}>{member.status === 'invited' ? 'New' : 'Active'}</Text>
  </View>;
}

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { role, user, signOut } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rosterTeam, setRosterTeam] = useState<RosterTeam>('14u');
  const filtered = useMemo(() => contacts.filter((contact) => `${contact.name} ${contact.role}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const rosterQuery = useQuery<RosterMember[]>({
    queryKey: ['/api/users', 'roster'],
    queryFn: () => customFetch<RosterMember[]>('/api/users', { responseType: 'json' }),
  });
  const filteredRoster = useMemo(() => (rosterQuery.data ?? []).filter((member) => member.teams.some((team) => rosterTeamAliases[rosterTeam].includes(team))), [rosterQuery.data, rosterTeam]);
  const initials = user?.fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'LPA';
  const logOut = () => Alert.alert('Log out?', 'You will need to sign in again to access LPA Hub.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => { signOut(); router.replace('/launch'); } }]);
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 115 }} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR LPA HUB</Text><Text style={[styles.title, { color: colors.foreground }]}>More</Text></View><Pressable testID="more-profile-button" accessibilityLabel="Open profile" onPress={() => router.push('/account')} style={[styles.avatar, { backgroundColor: colors.primary }]}><Text style={styles.avatarText}>{initials}</Text></Pressable></View>
      {role === 'Admin' || role === 'Staff-Coach' ? <Pressable testID="manage-users" onPress={() => router.push('/admin-dashboard')} style={[styles.manageUsers, { backgroundColor: colors.secondary, borderColor: colors.border }]}><View style={[styles.manageIcon, { backgroundColor: `${colors.primary}22` }]}><Feather name="layout" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.manageTitle, { color: colors.foreground }]}>Admin dashboard</Text><Text style={[styles.manageCopy, { color: colors.mutedForeground }]}>Invites, roster, roles, and calendar events</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable> : null}
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rosters</Text>
          <View style={[styles.teamFilter, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="users" size={15} color={colors.primary} />
            {rosterTeams.map((team) => <Pressable key={team} testID={`roster-filter-${team}`} accessibilityRole="button" accessibilityState={{ selected: rosterTeam === team }} onPress={() => setRosterTeam(team)} style={[styles.teamFilterButton, rosterTeam === team && { backgroundColor: colors.primary }]}><Text style={[styles.teamFilterText, { color: rosterTeam === team ? '#fff' : colors.mutedForeground }]}>{team}</Text></Pressable>)}
          </View>
          {rosterQuery.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 18 }} /> : rosterQuery.isError ? <Text style={[styles.rosterEmpty, { color: colors.mutedForeground }]}>Rosters could not load. Please try again.</Text> : filteredRoster.length ? <View style={styles.contactList}>{filteredRoster.map((member) => <RosterCard key={member.id} member={member} colors={colors} />)}</View> : <Text style={[styles.rosterEmpty, { color: colors.mutedForeground }]}>No active or new members are assigned to {rosterTeam}.</Text>}
          <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={16} color={colors.mutedForeground} /><TextInput value={query} onChangeText={setQuery} placeholder="Search staff and partners" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Staff directory</Text>
          <View style={styles.contactList}>{filtered.filter((contact) => !contact.partner).map((contact) => <ContactCard key={contact.name} contact={contact} colors={colors} />)}</View>
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 25 }]}>Partners</Text>
          <View style={styles.contactList}>{filtered.filter((contact) => contact.partner).map((contact) => <ContactCard key={contact.name} contact={contact} colors={colors} />)}</View>
        </>
       <Pressable testID="sign-out" onPress={logOut} style={[styles.signOut, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="log-out" size={17} color={colors.destructive} /><Text style={[styles.signOutText, { color: colors.destructive }]}>Log out</Text></Pressable>
     </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
   container: { flex: 1 }, header: { paddingHorizontal: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 6 }, title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 }, avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 11 }, signOut: { marginHorizontal: 18, marginTop: 28, minHeight: 48, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, signOutText: { fontFamily: 'Inter_700Bold', fontSize: 12 }, profileCard: { marginHorizontal: 18, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }, profileAvatar: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, profileAvatarText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }, profileName: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }, profileMeta: { color: '#B1C3C3', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, roleSwitcher: { marginHorizontal: 18, padding: 12, borderWidth: 1, borderRadius: 17, marginBottom: 12 }, roleLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9 }, roleOptions: { flexDirection: 'row', gap: 7 }, rolePill: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 7 }, roleText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, manageUsers: { minHeight: 67, marginHorizontal: 18, marginBottom: 18, borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, manageIcon: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, manageTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 3 }, manageCopy: { fontFamily: 'Inter_400Regular', fontSize: 10 }, segment: { marginHorizontal: 18, borderRadius: 14, padding: 3, flexDirection: 'row', marginBottom: 20 }, segmentButton: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 11 }, segmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, search: { marginHorizontal: 18, height: 43, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, marginBottom: 20 }, searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12 }, sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginHorizontal: 22, marginBottom: 11 }, contactList: { marginHorizontal: 18, gap: 9 }, contact: { minHeight: 70, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, contactAvatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, contactPhoto: { width: 40, height: 40, borderRadius: 13 }, partnerLogoBox: { width: 64, height: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, partnerLogo: { width: 58, height: 38 }, vinnaLogo: { width: 58, height: 18 }, betweenTheLinesLogo: { width: 42, height: 42 }, edOptionsLogo: { width: 60, height: 36 }, contactInitials: { fontFamily: 'Inter_700Bold', fontSize: 11 }, contactName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, contactRole: { fontFamily: 'Inter_400Regular', fontSize: 10 }, contactActions: { flexDirection: 'row', gap: 14 }, teamFilter: { marginHorizontal: 18, borderWidth: 1, borderRadius: 15, padding: 5, flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 12 }, teamFilterButton: { flex: 1, minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, teamFilterText: { fontFamily: 'Inter_600SemiBold', fontSize: 9 }, rosterEmpty: { marginHorizontal: 22, marginTop: 16, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center' }, status: { fontFamily: 'Inter_700Bold', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 }, scheduleCard: { marginHorizontal: 18, borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 18 }, scheduleLine: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14 }, scheduleDot: { width: 8, height: 8, borderRadius: 4 }, scheduleText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 }, linkRow: { marginHorizontal: 22, paddingTop: 19, marginTop: 24, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }, linkText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});