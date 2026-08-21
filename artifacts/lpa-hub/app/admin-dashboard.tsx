// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateCalendarEvent,
  useCreateChat,
  useCreateInvite,
  useDeleteCalendarEvent,
  useListCalendarEvents,
  useListUsers,
  useResendInvite,
  useRevokeInvite,
  useUpdateCalendarEvent,
  useUpdateUserRole, customFetch,
} from '@workspace/api-client-react';
import { useApp, useLiveSync } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { LPA_TEAMS, teamEventAliases } from '@/constants/teams';

type Section = 'Overview' | 'Roster' | 'Calendar' | 'Group Chats';
type Role = 'Admin' | 'Staff-Coach' | 'Parent-Athlete' | 'Athlete';
type UserRow = { id: string; fullName: string; email?: string | null; phone?: string | null; role: Role; status: string; teams: string[] };
type EventRow = { id: string; title: string; date: string; time: string; location: string; team: string };
const roles: Role[] = ['Admin', 'Staff-Coach', 'Parent-Athlete', 'Athlete'];
const teams = ['All Teams', 'Varsity', 'Junior Varsity', '14u', '15u', 'LPA Events'];
const rosterTeams = LPA_TEAMS;
const roleLabel = (role: Role) => role === 'Parent-Athlete' ? 'Parent/Guardian' : role;
const displayDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}-${month}-${year}` : iso;
};
const apiDate = (display: string) => {
  const match = display.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : display.trim();
};
const validApiDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

export default function AdminDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role: activeRole, user, isReady } = useApp();

  useEffect(() => {
    if (isReady && !user) router.replace({ pathname: '/launch', params: { returnTo: '/admin-dashboard' } });
  }, [isReady, router, user]);

  if (!isReady || !user) return <View style={[styles.denied, { backgroundColor: colors.background, justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;

  if (activeRole !== 'Admin' && activeRole !== 'Staff-Coach') return <View style={[styles.denied, { backgroundColor: colors.background, paddingTop: (Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top) + 24 }]}><View style={[styles.deniedIcon, { backgroundColor: `${colors.primary}20` }]}><Feather name="lock" size={25} color={colors.primary} /></View><Text style={[styles.deniedTitle, { color: colors.foreground }]}>Admin access required</Text><Text style={[styles.deniedCopy, { color: colors.mutedForeground }]}>Admin and Staff-Coach users can open the management dashboard. Parent/Guardian and Athlete users cannot.</Text><Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={styles.backButtonText}>Go back</Text></Pressable></View>;

  return <AdminDashboardContent />;
}

function AdminDashboardContent() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut, user: currentUser } = useApp();
  const { isSyncing, lastSyncedAt, syncError, syncSharedData } = useLiveSync();
  const [section, setSection] = useState<Section>('Overview');
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [roleMenuId, setRoleMenuId] = useState<string | null>(null);
  const [teamMenuId, setTeamMenuId] = useState<string | null>(null);
  const [eventTeam, setEventTeam] = useState('All Teams');
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventEndTime, setEventEndTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventFormTeam, setEventFormTeam] = useState('LPA Events');
  const [invite, setInvite] = useState({ fullName: '', email: '', phone: '', role: 'Parent-Athlete' as Role, team: '' });
  const [groupName, setGroupName] = useState('');
  const [groupParticipants, setGroupParticipants] = useState<string[]>([]);
  const [groupTeamFilter, setGroupTeamFilter] = useState('All Teams');
  const users = useListUsers(undefined, { query: { queryKey: ['/api/admin/users', 'live'] } });
  const calendar = useListCalendarEvents(eventTeam === 'All Teams' ? undefined : { team: eventTeam }, { query: { queryKey: ['/api/admin/calendar-events', eventTeam] } });
  const refreshAdminData = () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/users', 'roster'] });
    void syncSharedData();
  };
  const createInvite = useCreateInvite({ mutation: { onSuccess: () => { refreshAdminData(); setShowInvite(false); setInvite({ fullName: '', email: '', phone: '', role: 'Parent-Athlete', team: '' }); } } });
  const resendInvite = useResendInvite({ mutation: { onSuccess: refreshAdminData } });
  const revokeInvite = useRevokeInvite({ mutation: { onSuccess: refreshAdminData } });
  const updateRole = useUpdateUserRole({ mutation: { onSuccess: () => { refreshAdminData(); setRoleMenuId(null); } } });
  const updateTeam = async (id: string, team: string) => {
    try {
      await customFetch(`/api/admin/users/${id}/team`, { method: 'PATCH', body: JSON.stringify({ teams: [team] }) });
      setTeamMenuId(null); refreshAdminData();
    } catch (error) { Alert.alert('Could not update team', error instanceof Error ? error.message : 'Please try again.'); }
  };
  const invalidateCalendars = () => {
    void queryClient.invalidateQueries({ queryKey: calendar.queryKey });
    void queryClient.invalidateQueries({ queryKey: ['/api/admin/calendar-events'] });
    void queryClient.invalidateQueries({ queryKey: ['/api/calendar-events'] });
    void queryClient.invalidateQueries({ queryKey: ['/api/calendar.ics'] });
    void calendar.refetch();
  };
  const createEvent = useCreateCalendarEvent({ mutation: { onSuccess: () => { invalidateCalendars(); resetEventForm(); } } });
  const updateEvent = useUpdateCalendarEvent({ mutation: { onSuccess: () => { invalidateCalendars(); resetEventForm(); } } });
  const deleteEvent = useDeleteCalendarEvent({ mutation: { onSuccess: invalidateCalendars } });
  const createGroupChat = useCreateChat({ mutation: { onSuccess: (conversation) => { setGroupName(''); setGroupParticipants([]); void queryClient.invalidateQueries({ queryKey: ['/api/chats'] }); router.push(('/chat/' + conversation.id) as never); }, onError: (error) => Alert.alert('Could not create group chat', error.message) } });

  const rows = useMemo(() => ((users.data ?? []) as UserRow[]).filter((user) => `${user.fullName} ${user.email ?? ''} ${user.role} ${user.teams.join(' ')}`.toLowerCase().includes(search.toLowerCase())), [users.data, search]);
  const events = (calendar.data ?? []) as EventRow[];
  const activeUsers = rows.filter((user) => user.status === 'active').length;
  const invitedUsers = rows.filter((user) => user.status === 'invited').length;
  const adminUsers = rows.filter((user) => user.role === 'Admin').length;
  const activeGroupUsers = rows.filter((person) => person.status === 'active' && person.id !== currentUser?.id);
  const filteredGroupUsers = activeGroupUsers.filter((person) => groupTeamFilter === 'All Teams' || person.teams.some((team) => {
    const aliases = Object.entries(teamEventAliases).find(([canonical, values]) => canonical === groupTeamFilter || values.includes(groupTeamFilter))?.[1] ?? [groupTeamFilter];
    return aliases.includes(team);
  }));
  const handleInvite = () => createInvite.mutate({ data: { fullName: invite.fullName, email: invite.email || undefined, phone: invite.phone || undefined, role: invite.role, teams: invite.team ? [invite.team] : [] } }, { onError: (error) => Alert.alert('Invite not sent', error.message) });
  const saveEvent = () => {
    if (!eventTitle.trim() || !eventDate.trim() || !eventTime.trim()) return;
    const date = apiDate(eventDate);
    if (!validApiDate(date)) {
      Alert.alert('Enter a valid date', 'Use DD-MM-YYYY, for example 20-08-2026.');
      return;
    }
    const data = { title: eventTitle, date, time: eventEndTime.trim() ? `${eventTime.trim()} - ${eventEndTime.trim()}` : eventTime.trim(), location: eventLocation || 'LPA Campus', team: eventFormTeam };
    if (editingEvent) updateEvent.mutate({ id: editingEvent.id, data }, { onError: (error) => Alert.alert('Could not update event', error.message) });
    else createEvent.mutate({ data }, { onError: (error) => Alert.alert('Could not add event', error.message) });
  };
  const createGroup = () => {
    if (!groupName.trim() || !groupParticipants.length || createGroupChat.isPending) return;
    createGroupChat.mutate({ data: { type: 'group', name: groupName.trim(), userIds: groupParticipants } });
  };
  const resetEventForm = () => { setEditingEvent(null); setEventTitle(''); setEventDate(''); setEventTime(''); setEventEndTime(''); setEventLocation(''); setEventFormTeam('LPA Events'); };
  const openEdit = (event: EventRow) => { const [start, end] = event.time.split(/\s-\s/, 2); setEditingEvent(event); setEventTitle(event.title); setEventDate(displayDate(event.date)); setEventTime(start); setEventEndTime(end ?? ''); setEventLocation(event.location); setEventFormTeam(event.team); setSection('Calendar'); };
  const completeLogOut = () => {
    void Promise.resolve(signOut()).finally(() => router.replace('/launch'));
  };
  const logOut = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Log out of LPA Hub? You will need to sign in again to access the app.')) completeLogOut();
      return;
    }
    Alert.alert('Log out?', 'You will need to sign in again to access LPA Hub.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: completeLogOut }]);
  };

  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top) + 18, paddingBottom: Math.max(insets.bottom, 34) + 36 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View style={styles.headerLeft}><Pressable testID="admin-dashboard-back" accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="arrow-left" size={17} color={colors.primary} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.kicker, { color: colors.primary }]}>LEGENDARY PREP ACADEMY</Text><Text style={[styles.title, { color: colors.foreground }]}>Admin dashboard</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Manage your LPA Hub community from one place.</Text><Pressable testID="retry-admin-live-sync" disabled={isSyncing} onPress={refreshAdminData} style={styles.syncStatus}><View style={[styles.syncDot, { backgroundColor: syncError ? colors.destructive : isSyncing || users.isFetching || calendar.isFetching ? colors.primary : colors.accent }]} /><Text style={[styles.syncText, { color: colors.mutedForeground }]}>{syncError ? 'Live sync needs attention · tap to retry' : isSyncing || users.isFetching || calendar.isFetching ? 'Syncing live data…' : lastSyncedAt ? `Live · synced ${lastSyncedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Live sync ready'}</Text></Pressable></View></View><View style={styles.headerActions}><Pressable testID="refresh-admin-dashboard" accessibilityRole="button" onPress={refreshAdminData} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="refresh-cw" size={17} color={colors.primary} /></Pressable><Pressable testID="dashboard-sign-out" accessibilityRole="button" accessibilityLabel="Log out" onPress={logOut} style={[Platform.OS === 'web' ? styles.logoutButton : styles.iconButton, { backgroundColor: Platform.OS === 'web' ? `${colors.destructive}12` : colors.card, borderColor: Platform.OS === 'web' ? `${colors.destructive}40` : colors.border }]}><Feather name="log-out" size={16} color={colors.destructive} />{Platform.OS === 'web' ? <Text style={[styles.logoutText, { color: colors.destructive }]}>Log out</Text> : null}</Pressable></View></View>

      <View style={[styles.nav, { backgroundColor: colors.muted }]}>{(['Overview', 'Roster', 'Calendar', 'Group Chats'] as Section[]).map((item) => <Pressable key={item} testID={`admin-section-${item.toLowerCase().replace(' ', '-')}`} onPress={() => setSection(item)} style={[styles.navButton, section === item && { backgroundColor: colors.card }]}><Text style={[styles.navText, { color: section === item ? colors.foreground : colors.mutedForeground }]}>{item}</Text></Pressable>)}</View>

      {section === 'Overview' ? <><View style={styles.statGrid}><Stat label="Active members" value={activeUsers} icon="users" colors={colors} /><Stat label="Pending invites" value={invitedUsers} icon="send" colors={colors} /><Stat label="Administrators" value={adminUsers} icon="shield" colors={colors} /></View><View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.panelHeader}><View><Text style={[styles.panelTitle, { color: colors.foreground }]}>Invite a person</Text><Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>Email or SMS invitations are valid for seven days.</Text></View><Pressable testID="toggle-dashboard-invite" onPress={() => setShowInvite((open) => !open)} style={[styles.actionIcon, { backgroundColor: colors.primary }]}><Feather name={showInvite ? 'minus' : 'user-plus'} size={17} color="#fff" /></Pressable></View>{showInvite ? <InviteForm invite={invite} setInvite={setInvite} onSubmit={handleInvite} loading={createInvite.isPending} colors={colors} /> : <Pressable onPress={() => setShowInvite(true)} style={[styles.callout, { backgroundColor: colors.secondary }]}><Feather name="send" size={17} color={colors.primary} /><Text style={[styles.calloutText, { color: colors.foreground }]}>Send a new invitation</Text><Feather name="arrow-up-right" size={16} color={colors.primary} /></Pressable>}</View><View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.panelTitle, { color: colors.foreground }]}>Quick actions</Text><View style={styles.quickActions}><QuickAction label="Manage roster" icon="users" onPress={() => setSection('Roster')} colors={colors} /><QuickAction label="Add event" icon="calendar" onPress={() => { resetEventForm(); setSection('Calendar'); }} colors={colors} /><QuickAction label="Create group chat" icon="message-square" onPress={() => { setGroupName(''); setGroupParticipants([]); setSection('Group Chats'); }} colors={colors} /></View></View></> : null}

      {section === 'Roster' ? <><View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>User roster</Text><Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>{rows.length} people · manage roles and teams</Text></View><Pressable testID="open-dashboard-invite" onPress={() => { setShowInvite(true); setSection('Overview'); }} style={[styles.smallButton, { backgroundColor: colors.primary }]}><Feather name="user-plus" size={16} color="#fff" /><Text style={styles.smallButtonText}>Invite</Text></Pressable></View><View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={16} color={colors.mutedForeground} /><TextInput testID="dashboard-roster-search" value={search} onChangeText={setSearch} placeholder="Search name, email, role, or team" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View>{users.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 45 }} /> : <View style={styles.roster}>{rows.map((user) => <RosterCard key={user.id} user={user} colors={colors} roleMenuOpen={roleMenuId === user.id} teamMenuOpen={teamMenuId === user.id} onToggleRole={() => { setRoleMenuId(roleMenuId === user.id ? null : user.id); setTeamMenuId(null); }} onToggleTeam={() => { setTeamMenuId(teamMenuId === user.id ? null : user.id); setRoleMenuId(null); }} onRoleChange={(role) => updateRole.mutate({ id: user.id, data: { role } }, { onError: (error) => Alert.alert('Could not update role', error.message) })} onTeamChange={(team) => void updateTeam(user.id, team)} onResend={() => resendInvite.mutate({ id: user.id }, { onError: (error) => Alert.alert('Could not resend invite', error.message) })} onRevoke={() => revokeInvite.mutate({ id: user.id }, { onError: (error) => Alert.alert('Could not revoke invite', error.message) })} />)}</View>}</> : null}

      {section === 'Calendar' ? <><View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Calendar events</Text><Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>Create and manage shared LPA events.</Text></View></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamFilters}>{teams.map((team) => <Pressable key={team} onPress={() => setEventTeam(team)} style={[styles.teamPill, { backgroundColor: eventTeam === team ? colors.primary : colors.card, borderColor: eventTeam === team ? colors.primary : colors.border }]}><Text style={[styles.teamText, { color: eventTeam === team ? '#fff' : colors.foreground }]}>{team}</Text></Pressable>)}</ScrollView><View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.panelHeader}><View><Text style={[styles.panelTitle, { color: colors.foreground }]}>{editingEvent ? 'Edit event' : 'Add an event'}</Text><Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>{editingEvent ? 'Changes publish immediately.' : 'Visible to the selected LPA team.'}</Text></View>{editingEvent ? <Pressable onPress={resetEventForm}><Text style={[styles.cancel, { color: colors.primary }]}>Cancel</Text></Pressable> : null}</View><EventForm title={eventTitle} setTitle={setEventTitle} date={eventDate} setDate={setEventDate} time={eventTime} setTime={setEventTime} endTime={eventEndTime} setEndTime={setEventEndTime} location={eventLocation} setLocation={setEventLocation} team={eventFormTeam} setTeam={setEventFormTeam} onSubmit={saveEvent} loading={createEvent.isPending || updateEvent.isPending} edit={Boolean(editingEvent)} colors={colors} /></View>{calendar.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 34 }} /> : <View style={styles.eventList}>{events.map((event) => <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.eventDate, { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.eventDay, { color: colors.primary }]}>{displayDate(event.date)}</Text></View><View style={{ flex: 1 }}><Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text><Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>{event.time} · {event.location}</Text><Text style={[styles.eventTeam, { color: colors.primary }]}>{event.team}</Text></View><View style={styles.eventActions}><Pressable testID={`edit-event-${event.id}`} onPress={() => openEdit(event)}><Feather name="edit-2" size={16} color={colors.primary} /></Pressable><Pressable testID={`delete-event-${event.id}`} onPress={() => deleteEvent.mutate({ id: event.id }, { onError: (error) => Alert.alert('Could not delete event', error.message) })}><Feather name="trash-2" size={16} color={colors.destructive} /></Pressable></View></View>)}</View>}</> : null}
      {section === 'Group Chats' ? <><View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Group chats</Text><Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>Create a shared conversation and manage its participants from the chat.</Text></View></View><View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.panelTitle, { color: colors.foreground }]}>Create a group chat</Text><TextInput testID="group-chat-name" value={groupName} onChangeText={setGroupName} placeholder="Group name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginTop: 12 }]} /><Text style={[styles.formLabel, { color: colors.mutedForeground }]}>FILTER PARTICIPANTS BY TEAM</Text><View style={styles.groupTeamFilters}><ChoiceRow options={['All Teams', '14u', '15u', 'JV', 'Varsity', 'LPA']} value={groupTeamFilter} onChange={setGroupTeamFilter} colors={colors} /></View><Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PARTICIPANTS · {groupParticipants.length} SELECTED</Text><View style={styles.groupPeople}>{filteredGroupUsers.map((person) => { const selected = groupParticipants.includes(person.id); return <Pressable testID={`group-participant-${person.id}`} key={person.id} onPress={() => setGroupParticipants((current) => selected ? current.filter((id) => id !== person.id) : [...current, person.id])} style={[styles.groupPerson, { backgroundColor: selected ? `${colors.primary}18` : colors.background, borderColor: selected ? colors.primary : colors.border }]}><Text style={[styles.groupPersonName, { color: colors.foreground }]}>{person.fullName}</Text><Feather name={selected ? 'check-square' : 'square'} size={17} color={selected ? colors.primary : colors.mutedForeground} /></Pressable>; })}</View>{!filteredGroupUsers.length ? <Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>No active members are assigned to this team.</Text> : null}<Pressable testID="create-group-chat" onPress={createGroup} disabled={!groupName.trim() || !groupParticipants.length || createGroupChat.isPending} style={[styles.submit, { backgroundColor: groupName.trim() && groupParticipants.length ? colors.primary : colors.muted, marginTop: 14 }]}>{createGroupChat.isPending ? <ActivityIndicator color="#fff" /> : <><Text style={styles.submitText}>Create group chat</Text><Feather name="message-square" size={16} color="#fff" /></>}</Pressable></View></> : null}
    </ScrollView>
  </View>;
}

function Stat({ label, value, icon, colors }: { label: string; value: number; icon: keyof typeof Feather.glyphMap; colors: ReturnType<typeof useColors> }) { return <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.statIcon, { backgroundColor: `${colors.primary}18` }]}><Feather name={icon} size={16} color={colors.primary} /></View><Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text></View>; }
function QuickAction({ label, icon, onPress, colors }: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; colors: ReturnType<typeof useColors> }) { return <Pressable onPress={onPress} style={[styles.quickAction, { backgroundColor: colors.muted }]}><Feather name={icon} size={17} color={colors.primary} /><Text style={[styles.quickActionText, { color: colors.foreground }]}>{label}</Text><Feather name="arrow-up-right" size={15} color={colors.mutedForeground} /></Pressable>; }
function RosterCard({ user, colors, roleMenuOpen, teamMenuOpen, onToggleRole, onToggleTeam, onRoleChange, onTeamChange, onResend, onRevoke }: { user: UserRow; colors: ReturnType<typeof useColors>; roleMenuOpen: boolean; teamMenuOpen: boolean; onToggleRole: () => void; onToggleTeam: () => void; onRoleChange: (role: Role) => void; onTeamChange: (team: string) => void; onResend: () => void; onRevoke: () => void }) {
  return <View style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.initials, { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.initialsText, { color: colors.primary }]}>{user.fullName.split(' ').map((name) => name[0]).join('').slice(0, 2)}</Text></View><View style={{ flex: 1 }}><Text style={[styles.userName, { color: colors.foreground }]}>{user.fullName}</Text><Text style={[styles.userMeta, { color: colors.mutedForeground }]}>{user.email ?? user.phone ?? 'No contact'}</Text><View style={styles.userFooter}><Text style={[styles.status, { color: user.status === 'active' ? colors.accent : colors.primary }]}>{user.status}</Text><Pressable testID={`role-menu-${user.id}`} onPress={onToggleRole}><Text style={[styles.roleText, { color: colors.primary }]}>{roleLabel(user.role)} <Feather name="chevron-down" size={12} /></Text></Pressable><Pressable testID={`team-menu-${user.id}`} onPress={onToggleTeam} style={[styles.inlineTeamMenu, { borderColor: colors.border }]}><Text style={[styles.inlineTeamText, { color: colors.primary }]}>{user.teams[0] ?? 'Assign team'}</Text><Feather name="chevron-down" size={12} color={colors.primary} /></Pressable></View>{roleMenuOpen ? <View style={[styles.roleMenu, { borderColor: colors.border, backgroundColor: colors.muted }]}>{roles.map((nextRole) => <Pressable key={nextRole} onPress={() => onRoleChange(nextRole)} style={styles.roleOption}><Text style={[styles.roleOptionText, { color: nextRole === user.role ? colors.primary : colors.foreground }]}>{roleLabel(nextRole)}</Text>{nextRole === user.role ? <Feather name="check" size={14} color={colors.primary} /> : null}</Pressable>)}</View> : null}{teamMenuOpen ? <View style={[styles.roleMenu, { borderColor: colors.border, backgroundColor: colors.muted }]}>{rosterTeams.map((team) => <Pressable key={team} onPress={() => onTeamChange(team)} style={styles.roleOption}><Text style={[styles.roleOptionText, { color: team === user.teams[0] ? colors.primary : colors.foreground }]}>{team}</Text>{team === user.teams[0] ? <Feather name="check" size={14} color={colors.primary} /> : null}</Pressable>)}</View> : null}</View>{user.status === 'invited' ? <View style={styles.inviteActions}><Pressable testID={`dashboard-resend-${user.id}`} onPress={onResend} style={[styles.rowIcon, { backgroundColor: `${colors.accent}20` }]}><Feather name="send" size={15} color={colors.accent} /></Pressable><Pressable testID={`dashboard-revoke-${user.id}`} onPress={onRevoke} style={[styles.rowIcon, { backgroundColor: colors.muted }]}><Feather name="x" size={16} color={colors.mutedForeground} /></Pressable></View> : null}</View>;
}
function InviteForm({ invite, setInvite, onSubmit, loading, colors }: { invite: { fullName: string; email: string; phone: string; role: Role; team: string }; setInvite: React.Dispatch<React.SetStateAction<{ fullName: string; email: string; phone: string; role: Role; team: string }>>; onSubmit: () => void; loading: boolean; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.form}>
    <Field value={invite.fullName} onChangeText={(fullName) => setInvite((value) => ({ ...value, fullName }))} placeholder="Full name" colors={colors} />
    <Field value={invite.email} onChangeText={(email) => setInvite((value) => ({ ...value, email }))} placeholder="Email address" autoCapitalize="none" colors={colors} />
    <Field value={invite.phone} onChangeText={(phone) => setInvite((value) => ({ ...value, phone }))} placeholder="Mobile number" colors={colors} />
    <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>ROLE</Text>
    <ChoiceRow options={roles} value={invite.role} onChange={(role) => setInvite((value) => ({ ...value, role: role as Role }))} colors={colors} label={roleLabel} />
    <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TEAM</Text>
    <TeamDropdown value={invite.team} onChange={(team) => setInvite((value) => ({ ...value, team }))} colors={colors} testID="dashboard-invite-team" />
    <Pressable testID="dashboard-send-invite" onPress={onSubmit} disabled={loading || !invite.fullName || (!invite.email && !invite.phone) || !invite.team} style={[styles.submit, { backgroundColor: invite.fullName && (invite.email || invite.phone) && invite.team ? colors.primary : colors.muted }]}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.submitText}>Send invitation</Text><Feather name="send" size={16} color="#fff" /></>}</Pressable>
  </View>;
}
function EventForm({ title, setTitle, date, setDate, time, setTime, endTime, setEndTime, location, setLocation, team, setTeam, onSubmit, loading, edit, colors }: { title: string; setTitle: (value: string) => void; date: string; setDate: (value: string) => void; time: string; setTime: (value: string) => void; endTime: string; setEndTime: (value: string) => void; location: string; setLocation: (value: string) => void; team: string; setTeam: (value: string) => void; onSubmit: () => void; loading: boolean; edit: boolean; colors: ReturnType<typeof useColors> }) { return <View style={styles.form}><Field value={title} onChangeText={setTitle} placeholder="Event title" colors={colors} /><Field value={date} onChangeText={setDate} placeholder="Date (DD-MM-YYYY)" colors={colors} /><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field value={time} onChangeText={setTime} placeholder="Start (4:00 PM)" colors={colors} /></View><View style={{ flex: 1 }}><Field value={endTime} onChangeText={setEndTime} placeholder="End (12:00 PM)" colors={colors} /></View></View><Field value={location} onChangeText={setLocation} placeholder="Location" colors={colors} /><Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TEAM</Text><ChoiceRow options={teams.filter((item) => item !== 'All Teams')} value={team} onChange={setTeam} colors={colors} /><Pressable testID="dashboard-save-event" onPress={onSubmit} disabled={loading || !title || !date || !time} style={[styles.submit, { backgroundColor: title && date && time ? colors.primary : colors.muted }]}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.submitText}>{edit ? 'Save changes' : 'Create event'}</Text><Feather name="calendar" size={16} color="#fff" /></>}</Pressable></View>; }
function Field({ value, onChangeText, placeholder, colors, autoCapitalize }: { value: string; onChangeText: (value: string) => void; placeholder: string; colors: ReturnType<typeof useColors>; autoCapitalize?: 'none' }) { return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} autoCapitalize={autoCapitalize} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />; }
function TeamDropdown({ value, onChange, colors, testID }: { value: string; onChange: (value: string) => void; colors: ReturnType<typeof useColors>; testID: string }) {
  const [open, setOpen] = useState(false);
  return <View><Pressable testID={testID} onPress={() => setOpen((visible) => !visible)} style={[styles.teamSelect, { borderColor: colors.border, backgroundColor: colors.background }]}><Text style={[styles.teamSelectText, { color: value ? colors.foreground : colors.mutedForeground }]}>{value || 'Choose a team'}</Text><Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} /></Pressable>{open ? <View style={[styles.teamSelectMenu, { borderColor: colors.border, backgroundColor: colors.card }]}>{rosterTeams.map((team) => <Pressable key={team} onPress={() => { onChange(team); setOpen(false); }} style={styles.teamSelectOption}><Text style={[styles.teamSelectText, { color: team === value ? colors.primary : colors.foreground }]}>{team}</Text>{team === value ? <Feather name="check" size={15} color={colors.primary} /> : null}</Pressable>)}</View> : null}</View>;
}
function ChoiceRow({ options, value, onChange, colors, label = (option: string) => option }: { options: readonly string[]; value: string; onChange: (value: string) => void; colors: ReturnType<typeof useColors>; label?: (option: string) => string }) { return <View style={styles.choiceRow}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.choice, { backgroundColor: option === value ? colors.primary : colors.muted, borderColor: option === value ? colors.primary : colors.border }]}><Text style={[styles.choiceText, { color: option === value ? '#fff' : colors.foreground }]}>{label(option)}</Text></Pressable>)}</View>; }

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 18 }, header: { flexDirection: 'row', justifyContent: 'space-between', gap: 18, marginBottom: 24 }, headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, headerActions: { flexDirection: 'row', gap: 8 }, syncStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 }, syncDot: { width: 7, height: 7, borderRadius: 4 }, syncText: { fontFamily: 'Inter_500Medium', fontSize: 10 }, kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 7 }, title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.8 }, subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 7 }, iconButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, logoutButton: { height: 40, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, logoutText: { fontFamily: 'Inter_700Bold', fontSize: 12 }, nav: { borderRadius: 15, padding: 3, flexDirection: 'row', marginBottom: 18 }, navButton: { flex: 1, alignItems: 'center', borderRadius: 12, paddingVertical: 10 }, navText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, statGrid: { flexDirection: 'row', gap: 9, marginBottom: 12 }, stat: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 13, minHeight: 112 }, statIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, statValue: { fontFamily: 'Inter_700Bold', fontSize: 24 }, statLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 }, panel: { borderRadius: 19, borderWidth: 1, padding: 15, marginBottom: 12 }, panelHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }, panelTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 }, panelCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 }, actionIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, callout: { height: 50, borderRadius: 14, paddingHorizontal: 13, alignItems: 'center', flexDirection: 'row', gap: 10 }, calloutText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 }, quickActions: { gap: 9 }, quickAction: { height: 49, paddingHorizontal: 13, borderRadius: 14, alignItems: 'center', flexDirection: 'row', gap: 10 }, quickActionText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 }, form: { gap: 9 }, input: { height: 46, borderRadius: 13, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontFamily: 'Inter_400Regular', fontSize: 13 }, formLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1, marginTop: 3 }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 }, choiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 }, submit: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 3 }, submitText: { fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 12 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 }, sectionCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, smallButton: { height: 38, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, smallButtonText: { fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 11 }, search: { height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }, searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12 }, roster: { gap: 8 }, userCard: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, initials: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, initialsText: { fontFamily: 'Inter_700Bold', fontSize: 11 }, userName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, userMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14 }, userFooter: { flexDirection: 'row', gap: 11, alignItems: 'center', marginTop: 7 }, status: { fontFamily: 'Inter_700Bold', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }, roleText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 }, roleMenu: { borderWidth: 1, borderRadius: 11, overflow: 'hidden', marginTop: 8 }, roleOption: { minHeight: 33, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, roleOptionText: { fontFamily: 'Inter_500Medium', fontSize: 11 }, inviteActions: { flexDirection: 'row', gap: 7, paddingTop: 2 }, rowIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, teamFilters: { gap: 7, paddingBottom: 13 }, teamPill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }, teamText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, eventList: { gap: 8 }, eventCard: { borderRadius: 17, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, eventDate: { width: 45, height: 45, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, eventDay: { fontFamily: 'Inter_700Bold', fontSize: 11 }, eventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, eventMeta: { fontFamily: 'Inter_400Regular', fontSize: 10 }, eventTeam: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5, marginTop: 5 }, eventActions: { gap: 14 }, cancel: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, denied: { flex: 1, alignItems: 'center', paddingHorizontal: 30 }, deniedIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 17 }, deniedTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, textAlign: 'center' }, deniedCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 9 }, backButton: { height: 46, borderRadius: 14, paddingHorizontal: 20, justifyContent: 'center', marginTop: 23 }, backButtonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },
});
Object.assign(styles, StyleSheet.create({
  inlineTeamMenu: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 2 },
  inlineTeamText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  teamSelect: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamSelectText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  teamSelectMenu: { borderWidth: 1, borderRadius: 13, marginTop: 4, overflow: 'hidden' },
  teamSelectOption: { minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupPeople: { gap: 7, marginTop: 8 },
  groupTeamFilters: { marginVertical: 7 },
  groupPerson: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupPersonName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
}));