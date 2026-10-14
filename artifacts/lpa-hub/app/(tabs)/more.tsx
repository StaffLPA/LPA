import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CachedImage as Image } from '@/components/CachedImage';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, useCreateChat, useListDirectoryUsers, useSubmitFeedback } from '@workspace/api-client-react';
import { useTagCatalog } from '@/hooks/useTagCatalog';
import { tagLabel } from '@/constants/tagCatalog';
import { matchDirectoryContact } from '@/lib/contactDirectory';

const contacts = [
  { name: 'Mark Karaviotis', role: 'Head Coach', email: 'mark@legendaryprepacademy.com', phone: '602-905-9164', initials: 'MK', tint: '#AB562B', photo: require('../../assets/staff-mark-karaviotis-face.jpg') },
  { name: 'Taylor Hubbell', role: 'Middle School Head Coach', email: 'taylor@legendaryprepacademy.com', phone: '480-462-1471', initials: 'TH', tint: '#9BC7BD', photo: require('../../assets/staff-taylor-hubbell-face.jpg') },
  { name: 'Terrell Hudson', role: 'Assistant Coach', email: 'terrell@legendaryprepacademy.com', phone: '623-267-3533', initials: 'TH', tint: '#C88A62', photo: require('../../assets/staff-terrell-hudson-face.jpg') },
  { name: 'Joe Dunigan', role: 'Hitting Coordinator', email: 'joe@legendaryprepacademy.com', phone: undefined, initials: 'JD', tint: '#C89A62', photo: require('../../assets/staff-joe-dunigan-face.jpg') },
  { name: 'Josh Garcia', role: 'Director of Strength & Conditioning', email: 'josh@legendaryprepacademy.com', phone: undefined, initials: 'JG', tint: '#9BC7BD', photo: require('../../assets/staff-josh-garcia-face.jpg') },
  { name: 'Steve Karsay', role: 'Pitching Development Coordinator', email: 'Steve@legendaryprepacademy.com', phone: undefined, initials: 'SK', tint: '#C88A62', photo: require('../../assets/staff-steve-karsay-face.jpg') },
  { name: 'Martin Jacquez', role: 'Academic Advisor', email: 'martin@legendaryprepacademy.com', phone: undefined, initials: 'MJ', tint: '#AB562B', photo: require('../../assets/staff-martin-jacquez-updated-face.jpg') },
  { name: 'Vinna', role: 'Physical Therapy', email: 'contact@teamvinna.com', phone: '480-269-1184', website: 'https://www.teamvinna.com/', initials: 'VI', tint: '#9BC7BD', partner: true, logo: require('../../assets/vinna.png'), logoKind: 'vinna' },
  { name: 'The Creative Plate', role: 'Culinary Partner', email: undefined, phone: undefined, website: undefined, initials: 'CP', tint: '#AB562B', partner: true, logo: require('../../assets/the-creative-plate.png'), logoKind: 'creativeplate' },
  { name: 'Between the Lines', role: 'Contact Us · Partner', email: undefined, phone: '480-656-9959', website: 'https://www.betweenthelinesaz.com/', initials: 'BT', tint: '#C88A62', partner: true, logo: require('../../assets/between-the-lines.png'), logoKind: 'between' },
  { name: 'EdOptions', role: 'Partner · Charles Tack', email: 'ctack@educationaloptionsfoundation.org', phone: '602-741-3999', website: 'https://eohighschool.com/', initials: 'EO', tint: '#AB562B', partner: true, logo: require('../../assets/edoptions.jpg'), logoKind: 'edoptions' },
  { name: 'Legendary Parent Organization', role: 'Kisa White', email: 'moochie9.kj@gmail.com', phone: undefined, website: undefined, initials: 'LPO', tint: '#AB562B', partner: true, logo: require('../../assets/lpa-parent-organization-badge.png'), logoKind: 'phoenix' },
];

type Contact = (typeof contacts)[number];
const feedbackCategories = ['Bug', 'Problem with the app', 'Feature recommendation'] as const;
type FeedbackCategory = (typeof feedbackCategories)[number];
type RosterMember = { id: string; fullName: string; role: string; roleTag?: string | null; status: string; teams: string[]; gradYear?: string | null; profilePhotoUri?: string | null };
const rosterDirectoryUrl = '/api/users?view=roster-grad-years-v1';

function ContactCard({ contact, colors, onMessage, messageBusy, messagePending, messageError }: { contact: Contact; colors: ReturnType<typeof useColors>; onMessage?: () => void; messageBusy?: boolean; messagePending?: boolean; messageError?: string }) {
  return <View><View style={[styles.contact, { backgroundColor: colors.card, borderColor: colors.border }]}>
    {contact.photo ? <Image source={contact.photo} accessibilityLabel={`${contact.name} profile photo`} resizeMode="cover" style={styles.contactPhoto} /> : contact.logo ? <View style={[styles.partnerLogoBox, { backgroundColor: contact.logoKind === 'vinna' || contact.logoKind === 'phoenix' ? '#101010' : '#FFFFFF' }]}><Image source={contact.logo} accessibilityLabel={`${contact.name} logo`} resizeMode="contain" style={[styles.partnerLogo, contact.logoKind === 'phoenix' ? { width: 58, height: 44 } : contact.logoKind === 'vinna' ? styles.vinnaLogo : contact.logoKind === 'between' ? styles.betweenTheLinesLogo : styles.edOptionsLogo]} /></View> : <View style={[styles.contactAvatar, { backgroundColor: `${contact.tint}20` }]}><Text style={[styles.contactInitials, { color: contact.tint }]}>{contact.initials}</Text></View>}
    <View style={{ flex: 1 }}><Text style={[styles.contactName, { color: colors.foreground }]}>{contact.name}</Text><Text style={[styles.contactRole, { color: colors.mutedForeground }]}>{contact.role}</Text></View>
    <View style={styles.contactActions}>
      {contact.email ? <Pressable accessibilityLabel={`Email ${contact.name}`} onPress={() => void Linking.openURL(`mailto:${contact.email}`)}><Feather name="mail" size={17} color={colors.primary} /></Pressable> : null}
      {onMessage ? <Pressable testID={`directory-message-${contact.name.toLowerCase().replace(/[^a-z]+/g, '-')}`} accessibilityRole="button" accessibilityLabel={`Message ${contact.partner ? contact.role : contact.name}`} accessibilityState={{ disabled: !!messageBusy, busy: !!messagePending }} disabled={messageBusy} hitSlop={10} onPress={onMessage}>{messagePending ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="message-circle" size={17} color={colors.primary} />}</Pressable> : null}
      {contact.phone ? <Pressable accessibilityLabel={`Call ${contact.name}`} onPress={() => void Linking.openURL(`tel:${contact.phone}`)}><Feather name="phone" size={17} color={colors.primary} /></Pressable> : null}
      {contact.website ? <Pressable accessibilityLabel={`Open ${contact.name} website`} onPress={() => void Linking.openURL(contact.website)}><Feather name="external-link" size={17} color={colors.primary} /></Pressable> : null}
    </View>
  </View>{messageError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12, marginTop: 6, marginHorizontal: 12 }}>{messageError}</Text> : null}</View>;
}

function RosterCard({ member, colors, catalog }: { member: RosterMember; colors: ReturnType<typeof useColors>; catalog?: any }) {
  const initials = member.fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <View style={[styles.contact, { backgroundColor: colors.card, borderColor: colors.border }]}>
    {member.profilePhotoUri ? <Image source={{ uri: member.profilePhotoUri }} accessibilityLabel={`${member.fullName} profile photo`} resizeMode="cover" style={styles.contactPhoto} /> : <View style={[styles.contactAvatar, { backgroundColor: `${colors.primary}20` }]}><Text style={[styles.contactInitials, { color: colors.primary }]}>{initials}</Text></View>}
     <View style={{ flex: 1 }}><Text style={[styles.contactName, { color: colors.foreground }]}>{member.fullName}</Text><Text style={[styles.contactRole, { color: colors.mutedForeground }]}>{member.roleTag ?? member.role}</Text></View><Text style={[styles.status, { color: member.status === 'invited' ? colors.primary : colors.accent }]}>{member.status === 'invited' ? 'New' : 'Active'}</Text>
  </View>;
}

function GradYearDropdown({ value, onChange, colors, options, catalog }: { value: string; onChange: (value: string) => void; colors: ReturnType<typeof useColors>; options: string[]; catalog: any }) {
  const [open, setOpen] = useState(false);
  return <View style={{ marginHorizontal: 18, marginBottom: 14 }}>
    <Text style={[styles.gradYearLabel, { color: colors.mutedForeground }]}>Grad Year</Text>
    <Pressable testID="roster-grad-year-dropdown" accessibilityRole="button" accessibilityLabel="Filter by Grad Year" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={[styles.gradYearSelect, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.gradYearSelectText, { color: colors.foreground }]}>{value === 'All Grad Years' ? value : tagLabel(catalog, 'gradYears', value)}</Text>
      <Feather name="chevron-down" size={17} color={colors.mutedForeground} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.gradYearBackdrop} onPress={() => setOpen(false)}>
        <Pressable style={[styles.gradYearMenu, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
          <Text style={[styles.gradYearMenuTitle, { color: colors.foreground }]}>Grad Year</Text>
          {options.map((option) => <Pressable key={option} testID={`roster-filter-${option}`} accessibilityRole="button" accessibilityState={{ selected: value === option }} onPress={() => { onChange(option); setOpen(false); }} style={[styles.gradYearOption, { borderBottomColor: colors.border }, value === option && { backgroundColor: `${colors.primary}18` }]}>
             <Text style={[styles.gradYearOptionText, { color: value === option ? colors.primary : colors.foreground }]}>{option === 'All Grad Years' ? option : tagLabel(catalog, 'gradYears', option)}</Text>
            {value === option ? <Feather name="check" size={16} color={colors.primary} /> : null}
          </Pressable>)}
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { role, user, signOut } = useApp();
  const catalogQuery = useTagCatalog();
  const catalog = catalogQuery.data;
  const graduationYears = useMemo(() => (catalog?.gradYears ?? []).map((year: any) => year.id), [catalog?.gradYears]);
  const graduationYearOptions = useMemo(() => ['All Grad Years', ...graduationYears], [graduationYears]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const directory = useListDirectoryUsers({ query: { queryKey: ['/api/users', user?.id, 'contact-directory'], enabled: !!user, staleTime: 10_000, refetchInterval: 30_000 } });
  const createChat = useCreateChat();
  const sendFeedback = useSubmitFeedback();
  const feedbackInFlight = useRef(false);
  const messageInFlight = useRef(false);
  const [messagingContact, setMessagingContact] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<{ name: string; message: string } | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory | null>(null);
  const [feedbackCategoryOpen, setFeedbackCategoryOpen] = useState(false);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const openDirectMessage = async (contact: Contact) => {
    if (!user || messageInFlight.current || !contact.email) return;
    messageInFlight.current = true;
    setMessagingContact(contact.name);
    setMessageError(null);
    try {
      // Recheck the active account at click time rather than relying on a stale roster.
      const fresh = await directory.refetch();
      if (fresh.isError) throw new Error('Could not load active contacts. Please try again.');
      const matches = matchDirectoryContact(contact, fresh.data ?? []);
      if (matches.length !== 1) throw new Error(matches.length ? 'More than one account matches this contact. Please ask an administrator to check the directory.' : `No active ${contact.partner ? 'account' : 'Staff-Coach account'} is linked to this contact yet.`);
      if (matches[0].id === user.id) throw new Error('This contact is your own account.');
      const conversation = await createChat.mutateAsync({ data: { type: 'direct', userIds: [matches[0].id] } });
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      router.push(('/chat/' + conversation.id) as never);
    } catch (error) {
      setMessageError({ name: contact.name, message: error instanceof Error ? error.message : 'Could not open this direct message. Please try again.' });
    } finally {
      messageInFlight.current = false;
      setMessagingContact(null);
    }
  };
  const [query, setQuery] = useState('');
  const [rosterGradYear, setRosterGradYear] = useState('All Grad Years');
  const [rosterVisibleCount, setRosterVisibleCount] = useState(60);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => contacts.filter((contact) => `${contact.name} ${contact.role}`.toLowerCase().includes(normalizedQuery)), [normalizedQuery]);
  const rosterQuery = useQuery<RosterMember[]>({
    queryKey: [rosterDirectoryUrl],
    queryFn: () => customFetch<RosterMember[]>(rosterDirectoryUrl, {
      responseType: 'json',
      headers: { 'cache-control': 'no-store', pragma: 'no-cache' },
    }),
  });
  const filteredRoster = useMemo(() => (rosterQuery.data ?? []).filter((member) => (
     Boolean(member.gradYear)
    && (rosterGradYear === 'All Grad Years' || member.gradYear === rosterGradYear)
    && `${member.fullName} ${member.role} ${member.status} ${member.gradYear ?? ''}`.toLowerCase().includes(normalizedQuery)
  )), [rosterQuery.data, rosterGradYear, normalizedQuery]);
  const visibleRoster = useMemo(() => filteredRoster.slice(0, rosterVisibleCount), [filteredRoster, rosterVisibleCount]);
  const initials = user?.fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'LPA';
  const logOut = () => setShowLogoutConfirm(true);
  const completeLogout = () => {
    setShowLogoutConfirm(false);
    signOut();
    router.replace('/launch');
  };
  const submitAppFeedback = async () => {
    const notes = feedbackNotes.trim();
    if (!feedbackCategory || !notes || feedbackInFlight.current) return;
    feedbackInFlight.current = true;
    setFeedbackError('');
    try {
      const result = await sendFeedback.mutateAsync({ data: { category: feedbackCategory, notes } });
      setFeedbackOpen(false);
      setFeedbackCategory(null);
      setFeedbackNotes('');
      setFeedbackCategoryOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      router.push(('/chat/' + result.conversationId) as never);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Could not send feedback. Please try again.');
    } finally {
      feedbackInFlight.current = false;
    }
  };
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 115 }} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR LPA</Text><Text style={[styles.title, { color: colors.foreground }]}>More</Text></View><Pressable testID="more-profile-button" accessibilityLabel="Open profile" onPress={() => router.push('/account')} style={[styles.avatar, { backgroundColor: colors.primary }]}>{user?.profilePhotoUri ? <Image source={{ uri: user.profilePhotoUri }} accessibilityLabel="Your profile picture" resizeMode="cover" style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials}</Text>}</Pressable></View>
      {role === 'Admin' || role === 'Staff-Coach' ? <Pressable testID="manage-users" onPress={() => router.push('/admin-dashboard')} style={[styles.manageUsers, { backgroundColor: colors.secondary, borderColor: colors.border }]}><View style={[styles.manageIcon, { backgroundColor: `${colors.primary}22` }]}><Feather name="layout" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.manageTitle, { color: colors.foreground }]}>Admin dashboard</Text><Text style={[styles.manageCopy, { color: colors.mutedForeground }]}>Invites, roster, roles, and calendar events</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable> : null}
      {role === 'Admin' || role === 'Staff-Coach' ? <Pressable testID="daily-rollcall-entry" accessibilityRole="button" onPress={() => router.push('/daily-rollcall')} style={[styles.manageUsers, { backgroundColor: colors.secondary, borderColor: colors.border }]}><View style={[styles.manageIcon, { backgroundColor: `${colors.primary}22` }]}><Feather name="clipboard" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.manageTitle, { color: colors.foreground }]}>Daily Rollcall</Text><Text style={[styles.manageCopy, { color: colors.mutedForeground }]}>Coach, bus, and academics attendance</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable> : null}
      {role === 'Admin' || role === 'Staff-Coach' ? <Pressable testID="forms-entry" accessibilityRole="button" onPress={() => router.push('/forms')} style={[styles.manageUsers, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View style={[styles.manageIcon, { backgroundColor: `${colors.primary}22` }]}><Feather name="file-text" size={18} color={colors.primary} /></View>
        <View style={{ flex: 1 }}><Text style={[styles.manageTitle, { color: colors.foreground }]}>Microsoft Forms Submissions</Text><Text style={[styles.manageCopy, { color: colors.mutedForeground }]}>Requests, approvals, and status updates</Text></View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </Pressable> : null}
      <Pressable testID="performance-reports-entry" accessibilityRole="button" onPress={() => router.push((role === 'Admin' || role === 'Staff-Coach' ? '/metrics' : '/metrics/reports') as never)} style={[styles.manageUsers, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View style={[styles.manageIcon, { backgroundColor: `${colors.primary}22` }]}><Feather name="award" size={18} color={colors.primary} /></View>
        <View style={{ flex: 1 }}><Text style={[styles.manageTitle, { color: colors.foreground }]}>{role === 'Admin' || role === 'Staff-Coach' ? 'LPA Metrics' : 'Performance reports'}</Text><Text style={[styles.manageCopy, { color: colors.mutedForeground }]}>{role === 'Admin' || role === 'Staff-Coach' ? 'Testing, progress, and reports' : 'Published athlete progress reports'}</Text></View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </Pressable>
        <>
          <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={16} color={colors.mutedForeground} /><TextInput value={query} onChangeText={setQuery} placeholder="Search staff, partners, and rosters" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rosters</Text>
            <GradYearDropdown value={rosterGradYear} options={graduationYearOptions} catalog={catalog} onChange={(gradYear) => { setRosterGradYear(gradYear); setRosterVisibleCount(60); }} colors={colors} />
           {rosterQuery.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 18 }} /> : rosterQuery.isError ? <Text style={[styles.rosterEmpty, { color: colors.mutedForeground }]}>Rosters could not load. Please try again.</Text> : filteredRoster.length ? <><View style={styles.contactList}>{visibleRoster.map((member) => <RosterCard key={member.id} member={member} colors={colors} />)}</View>{visibleRoster.length < filteredRoster.length ? <Pressable testID="show-more-roster-members" onPress={() => setRosterVisibleCount((count) => count + 60)} style={[styles.showMore, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.showMoreText, { color: colors.primary }]}>Show 60 more · {filteredRoster.length - visibleRoster.length} remaining</Text></Pressable> : null}</> : <Text style={[styles.rosterEmpty, { color: colors.mutedForeground }]}>No roster members match {rosterGradYear}.</Text>}
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 25 }]}>Staff directory</Text>
          <View style={styles.contactList}>{filtered.filter((contact) => !contact.partner).map((contact) => <ContactCard key={contact.name} contact={contact} colors={colors} onMessage={() => void openDirectMessage(contact)} messageBusy={!!messagingContact} messagePending={messagingContact === contact.name} messageError={messageError?.name === contact.name ? messageError.message : undefined} />)}</View>
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 25 }]}>Partners</Text>
          <View style={styles.contactList}>{filtered.filter((contact) => contact.partner).map((contact) => <ContactCard key={contact.name} contact={contact} colors={colors} onMessage={contact.name === 'Legendary Parent Organization' ? () => void openDirectMessage(contact) : undefined} messageBusy={!!messagingContact} messagePending={messagingContact === contact.name} messageError={messageError?.name === contact.name ? messageError.message : undefined} />)}</View>
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 25 }]}>Ask for feedback</Text>
          <Pressable testID="ask-for-feedback" accessibilityRole="button" onPress={() => { setFeedbackError(''); setFeedbackOpen(true); }} style={[feedbackStyles.entry, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.manageIcon, { backgroundColor: `${colors.primary}22` }]}><Feather name="message-square" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.manageTitle, { color: colors.foreground }]}>Share app feedback</Text><Text style={[styles.manageCopy, { color: colors.mutedForeground }]}>Report a bug or suggest an improvement</Text></View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        </>
       <Pressable testID="sign-out" onPress={logOut} style={[styles.signOut, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="log-out" size={17} color={colors.destructive} /><Text style={[styles.signOutText, { color: colors.destructive }]}>Log out</Text></Pressable>
     </ScrollView>
      <Modal visible={feedbackOpen} transparent animationType="slide" onRequestClose={() => { if (!sendFeedback.isPending) setFeedbackOpen(false); }}>
        <KeyboardAvoidingView style={feedbackStyles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View testID="feedback-form" style={[feedbackStyles.modal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={feedbackStyles.modalContent}>
            <View style={feedbackStyles.heading}>
              <View style={{ flex: 1 }}>
                <Text style={[feedbackStyles.title, { color: colors.foreground }]}>Ask for feedback</Text>
                <Text style={[feedbackStyles.copy, { color: colors.mutedForeground }]}>Your note will be shared with the LPA admin team.</Text>
              </View>
              <Pressable testID="close-feedback" accessibilityRole="button" accessibilityLabel="Close feedback form" disabled={sendFeedback.isPending} onPress={() => setFeedbackOpen(false)} hitSlop={8}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={[feedbackStyles.label, { color: colors.foreground }]}>Feedback type <Text style={{ color: colors.destructive }}>*</Text></Text>
            <Pressable testID="feedback-category-dropdown" accessibilityRole="button" accessibilityState={{ expanded: feedbackCategoryOpen }} onPress={() => setFeedbackCategoryOpen((open) => !open)} style={[feedbackStyles.dropdown, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={{ color: feedbackCategory ? colors.foreground : colors.mutedForeground, fontSize: 14 }}>{feedbackCategory ?? 'Choose a type'}</Text>
              <Feather name={feedbackCategoryOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
            </Pressable>
            {feedbackCategoryOpen ? <View style={[feedbackStyles.options, { borderColor: colors.border, backgroundColor: colors.background }]}>
              {feedbackCategories.map((category) => <Pressable key={category} testID={`feedback-category-${feedbackCategories.indexOf(category)}`} accessibilityRole="button" accessibilityState={{ selected: feedbackCategory === category }} onPress={() => { setFeedbackCategory(category); setFeedbackCategoryOpen(false); }} style={[feedbackStyles.option, { borderBottomColor: colors.border }]}>
                <Text style={[feedbackStyles.optionText, { color: colors.foreground }]}>{category}</Text>
                {feedbackCategory === category ? <Feather name="check" size={17} color={colors.primary} /> : null}
              </Pressable>)}
            </View> : null}
            <Text style={[feedbackStyles.label, { color: colors.foreground, marginTop: 18 }]}>Notes <Text style={{ color: colors.destructive }}>*</Text></Text>
            <TextInput
              testID="feedback-notes"
              accessibilityLabel="Required feedback notes"
              value={feedbackNotes}
              onChangeText={setFeedbackNotes}
              placeholder="Tell us what happened or what you’d like to see."
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={1700}
              textAlignVertical="top"
              editable={!sendFeedback.isPending}
              style={[feedbackStyles.notes, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <Text style={[feedbackStyles.counter, { color: colors.mutedForeground }]}>{feedbackNotes.length}/1700</Text>
            {feedbackError ? <Text accessibilityRole="alert" style={[feedbackStyles.error, { color: colors.destructive }]}>{feedbackError}</Text> : null}
            <Pressable testID="submit-feedback" accessibilityRole="button" accessibilityState={{ disabled: !feedbackCategory || !feedbackNotes.trim() || sendFeedback.isPending, busy: sendFeedback.isPending }} disabled={!feedbackCategory || !feedbackNotes.trim() || sendFeedback.isPending} onPress={() => void submitAppFeedback()} style={[feedbackStyles.submit, { backgroundColor: colors.primary, opacity: !feedbackCategory || !feedbackNotes.trim() || sendFeedback.isPending ? 0.55 : 1 }]}>
              {sendFeedback.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[feedbackStyles.submitText, { color: colors.primaryForeground }]}>Submit feedback</Text>}
            </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={showLogoutConfirm} transparent animationType="fade" onRequestClose={() => setShowLogoutConfirm(false)}>
        <Pressable style={styles.logoutBackdrop} onPress={() => setShowLogoutConfirm(false)}>
          <Pressable testID="logout-confirmation" style={[styles.logoutModal, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
            <View style={[styles.logoutIcon, { backgroundColor: `${colors.destructive}18` }]}><Feather name="log-out" size={19} color={colors.destructive} /></View>
            <Text style={[styles.logoutTitle, { color: colors.foreground }]}>Log out?</Text>
            <Text style={[styles.logoutCopy, { color: colors.mutedForeground }]}>You will need to sign in again to access LPA.</Text>
            <View style={styles.logoutActions}>
              <Pressable testID="cancel-logout" onPress={() => setShowLogoutConfirm(false)} style={[styles.logoutButton, { borderColor: colors.border }]}><Text style={[styles.logoutCancelText, { color: colors.foreground }]}>Cancel</Text></Pressable>
              <Pressable testID="confirm-logout" onPress={completeLogout} style={[styles.logoutButton, { backgroundColor: colors.destructive, borderColor: colors.destructive }]}><Text style={styles.logoutConfirmText}>Log out</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
  </View>;
}

 const styles = StyleSheet.create({
     container: { flex: 1 }, header: { paddingHorizontal: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 6 }, title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 }, avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatarImage: { width: '100%', height: '100%' }, avatarText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 11 }, signOut: { marginHorizontal: 18, marginTop: 28, minHeight: 48, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, signOutText: { fontFamily: 'Inter_700Bold', fontSize: 12 }, logoutBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'center', padding: 22 }, logoutModal: { borderWidth: 1, borderRadius: 20, padding: 20 }, logoutIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 13 }, logoutTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 }, logoutCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 6 }, logoutActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 20 }, logoutButton: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, justifyContent: 'center' }, logoutCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, logoutConfirmText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 }, profileCard: { marginHorizontal: 18, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }, profileAvatar: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, profileAvatarText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }, profileMeta: { color: '#B1C3C3', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, roleSwitcher: { marginHorizontal: 18, padding: 12, borderWidth: 1, borderRadius: 17, marginBottom: 12 }, roleLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9 }, roleOptions: { flexDirection: 'row', gap: 7 }, rolePill: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 7 }, roleText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, manageUsers: { minHeight: 67, marginHorizontal: 18, marginBottom: 18, borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, manageIcon: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, manageTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 3 }, manageCopy: { fontFamily: 'Inter_400Regular', fontSize: 10 }, segment: { marginHorizontal: 18, borderRadius: 14, padding: 3, flexDirection: 'row', marginBottom: 20 }, segmentButton: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 11 }, segmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, search: { marginHorizontal: 18, height: 43, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, marginBottom: 20 }, searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12 }, sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginHorizontal: 22, marginBottom: 11 }, contactList: { marginHorizontal: 18, gap: 9 }, contact: { minHeight: 70, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, contactAvatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, contactPhoto: { width: 40, height: 40, borderRadius: 13 }, partnerLogoBox: { width: 64, height: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, partnerLogo: { width: 58, height: 38 }, vinnaLogo: { width: 58, height: 18 }, betweenTheLinesLogo: { width: 42, height: 42 }, edOptionsLogo: { width: 60, height: 36 }, contactInitials: { fontFamily: 'Inter_700Bold', fontSize: 11 }, contactName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, contactRole: { fontFamily: 'Inter_400Regular', fontSize: 10 }, contactActions: { flexDirection: 'row', gap: 14 }, gradYearFilter: { marginHorizontal: 18, borderWidth: 1, borderRadius: 15, padding: 5, flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 12 }, gradYearFilterButton: { minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, gradYearFilterText: { fontFamily: 'Inter_600SemiBold', fontSize: 9 }, gradYearLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 7 }, gradYearSelect: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, gradYearSelectText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, gradYearBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-end' }, gradYearMenu: { borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24 }, gradYearMenuTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginBottom: 8 }, gradYearOption: { minHeight: 46, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }, gradYearOptionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 }, status: { fontFamily: 'Inter_700Bold', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 }, rosterEmpty: { marginHorizontal: 22, marginTop: 16, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center' }, showMore: { minHeight: 44, marginHorizontal: 18, marginTop: 12, borderWidth: 1, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }, showMoreText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
});

const feedbackStyles = StyleSheet.create({
  entry: { minHeight: 70, marginHorizontal: 18, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'center', paddingHorizontal: 18 },
  modal: { borderWidth: 1, borderRadius: 20, maxHeight: '90%' },
  modalContent: { padding: 18 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  copy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 5 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 8 },
  dropdown: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  options: { borderWidth: 1, borderRadius: 13, marginTop: 5, paddingHorizontal: 11 },
  option: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  optionText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  notes: { minHeight: 120, maxHeight: 200, borderWidth: 1, borderRadius: 13, padding: 12, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  counter: { fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'right', marginTop: 5 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 9 },
  submit: { minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  submitText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
});