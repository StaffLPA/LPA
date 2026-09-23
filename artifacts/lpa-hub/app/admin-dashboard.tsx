 'LPA Events' ? colors.accentForeground : eventTeam === team ? '#fff' : colors.foreground }]}>{team}</Text></Pressable>)}</ScrollView><View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.panelHeader}><View><Text style={[styles.panelTitle, { color: colors.foreground }]}>{editingEvent ? 'Edit event' : 'Add an event'}</Text><Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>{editingEvent ? 'Changes publish immediately.' : 'Visible to the selected LPA team.'}</Text></View>{editingEvent ? <Pressable onPress={resetEventForm}><Text style={[styles.cancel, { color: colors.primary }]}>Cancel</Text></Pressable> : null}</View><EventForm key={`${eventFormRevision}-${editingEvent?.id ?? 'new'}`} title={eventTitle} setTitle={setEventTitle} date={eventDate} setDate={setEventDate} time={eventTime} setTime={setEventTime} endTime={eventEndTime} setEndTime={setEventEndTime} location={eventLocation} setLocation={eventLocation} team={eventFormTeam} setTeam={setEventFormTeam} repeatUntil={editingEvent?.repeatUntil} onSubmit={saveEvent} loading={savingEvents || createEvent.isPending || createRepeatedEvents.isPending} edit={Boolean(editingEvent)} colors={colors} /></View>{calendar.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 34 }} /> : <View style={styles.eventList}>{events.map((event) => { const eventColor = getCalendarTeamColor(event.team); return <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: eventColor }} /><View style={[styles.eventDate, { backgroundColor: `${eventColor}18` }]}><Text style={[styles.eventDay, { color: eventColor }]}>{displayDate(event.date)}</Text></View><View style={{ flex: 1 }}><Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text><Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>{event.time} · {event.location}</Text><Text style={[styles.eventTeam, { color: eventColor }]}>{event.team}</Text>{event.repeatUntil ? <Text style={[styles.repeatSeriesMeta, { color: colors.mutedForeground }]}>Daily repeat · through {displayDate(event.repeatUntil)}</Text> : null}</View><View style={styles.eventActions}><Pressable testID={`edit-event-${event.id}`} onPress={() => openEdit(event)}><Feather name="edit-2" size={16} color={eventColor} /></Pressable><Pressable testID={`delete-event-${event.id}`} onPress={() => deleteEvent.mutate({ id: event.id }, { onError: (error) => Alert.alert('Could not delete event', error.message) })}><Feather name="trash-2" size={16} color={colors.destructive} /></Pressable></View></View>; })}</View>}</> : null}
      {section === 'Schedule Images' ? <ScheduleImagesPanel colors={colors} images={scheduleImages} uploading={uploadingScheduleImage} onUpload={(kind) => void uploadScheduleImage(kind)} /> : null}
       {section === 'Family Links' ? <FamilyLinksPanel
         colors={colors}
         isFullAdmin={currentUser?.role === 'Admin'}
         search={familySearch}
         setSearch={setFamilySearch}
         athletes={athleteCandidates}
         guardians={guardianCandidates}
         selectedAthleteId={selectedAthleteId}
         selectedGuardianId={selectedGuardianId}
         onSelectAthlete={setSelectedAthleteId}
         onSelectGuardian={setSelectedGuardianId}
         links={(guardianLinks.data ?? []) as GuardianLink[]}
         loading={guardianLinks.isLoading}
         saving={createGuardianLink.isPending}
         onLink={() => {
           if (!selectedAthleteId || !selectedGuardianId) return;
           createGuardianLink.mutate({ data: { athleteId: selectedAthleteId, guardianId: selectedGuardianId } }, { onError: (error) => Alert.alert('Could not link family accounts', error.message) });
         }}
         onUnlink={(id) => deleteGuardianLink.mutate({ id }, { onError: (error) => Alert.alert('Could not unlink family accounts', error.message) })}
       /> : null}
      {section === 'Group Chats' ? <>
        <View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Group chats</Text><Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>Create a shared conversation and manage its participants from the chat.</Text></View></View>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.foreground }]}>Create a group chat</Text>
          <TextInput testID="group-chat-name" value={groupName} onChangeText={setGroupName} placeholder="Group name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginTop: 12 }]} />
          <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>FILTER PARTICIPANTS BY TEAM</Text>
          <View style={styles.groupTeamFilters}><ChoiceRow options={['All Teams', '14u', '15u', 'JV', 'Varsity', 'LPA']} value={groupTeamFilter} onChange={setGroupTeamFilter} colors={colors} /></View>
          <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PARTICIPANTS · {groupParticipants.length} SELECTED</Text>
          <View style={styles.groupPeople}>
            {filteredGroupUsers.map((person) => {
              const isSelf = person.id === currentUser?.id;
              const selected = isSelf || groupParticipants.includes(person.id);
              return <Pressable testID={`group-participant-${person.id}`} key={person.id} disabled={isSelf} onPress={() => setGroupParticipants((current) => selected ? current.filter((id) => id !== person.id) : [...current, person.id])} style={[styles.groupPerson, { backgroundColor: selected ? `${colors.primary}18` : colors.background, borderColor: selected ? colors.primary : colors.border }]}>
                <Text style={[styles.groupPersonName, { color: colors.foreground }]}>{person.fullName}{isSelf ? ' (You · included)' : ''}</Text>
                <Feather name={selected ? 'check-square' : 'square'} size={17} color={selected ? colors.primary : colors.mutedForeground} />
              </Pressable>;
            })}
          </View>
          {!filteredGroupUsers.length ? <Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>No active members are assigned to this team.</Text> : null}
          <Pressable testID="create-group-chat" onPress={createGroup} disabled={!groupName.trim() || !groupParticipants.length || createGroupChat.isPending} style={[styles.submit, { backgroundColor: groupName.trim() && groupParticipants.length ? colors.primary : colors.muted, marginTop: 14 }]}>{createGroupChat.isPending ? <ActivityIndicator color="#fff" /> : <><Text style={styles.submitText}>Create group chat</Text><Feather name="message-square" size={16} color="#fff" /></>}</Pressable>
        </View>
      </> : null}

      {section === 'Announcements' ? <AdminAnnouncementsPanel colors={colors} /> : null}
      {section === 'Tagging' ? <TagCatalogPanel colors={colors} catalog={tagCatalog} unavailable={tagApiUnavailable} error={tagApiUnavailable ? 'Tag editing is not available on this server yet. Publish the updated API server, then try again.' : tagError} onCreate={(kind, label) => createTag.mutate({ kind, data: { label } })} onRename={(kind, id, label) => renameTag.mutate({ kind, id, data: { label } })} onDelete={(kind, id) => deleteTag.mutate({ kind, id })} /> : null}

    </ScrollView>
  </View>;
}

function Stat({ label, value, icon, colors }: { label: string; value: number; icon: keyof typeof Feather.glyphMap; colors: ReturnType<typeof useColors> }) { return <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.statIcon, { backgroundColor: `${colors.primary}18` }]}><Feather name={icon} size={16} color={colors.primary} /></View><Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text></View>; }
function QuickAction({ label, icon, onPress, colors }: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; colors: ReturnType<typeof useColors> }) { return <Pressable onPress={onPress} style={[styles.quickAction, { backgroundColor: colors.muted }]}><Feather name={icon} size={17} color={colors.primary} /><Text style={[styles.quickActionText, { color: colors.foreground }]}>{label}</Text><Feather name="arrow-up-right" size={15} color={colors.mutedForeground} /></Pressable>; }
function FamilyLinksPanel({ colors, isFullAdmin, search, setSearch, athletes, guardians, selectedAthleteId, selectedGuardianId, onSelectAthlete, onSelectGuardian, links, loading, saving, onLink, onUnlink }: { colors: ReturnType<typeof useColors>; isFullAdmin: boolean; search: string; setSearch: (value: string) => void; athletes: UserRow[]; guardians: UserRow[]; selectedAthleteId: string | null; selectedGuardianId: string | null; onSelectAthlete: (id: string) => void; onSelectGuardian: (id: string) => void; links: GuardianLink[]; loading: boolean; saving: boolean; onLink: () => void; onUnlink: (id: string) => void }) {
  if (!isFullAdmin) return <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="shield" size={22} color={colors.primary} /><Text style={[styles.panelTitle, { color: colors.foreground, marginTop: 10 }]}>Family links are Admin-only</Text><Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>Staff-Coaches can manage the dashboard, but only full Admins can link athlete and parent/guardian accounts.</Text></View>;
  const selectedAthlete = athletes.find((person) => person.id === selectedAthleteId);
  const selectedGuardian = guardians.find((person) => person.id === selectedGuardianId);
  const confirmUnlink = (link: GuardianLink) => {
    const message = `Remove the family link between ${link.athlete.fullName} and ${link.guardian.fullName}? Their messages and other private data remain separate.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) onUnlink(link.id);
      return;
    }
    Alert.alert('Remove family link?', message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove link', style: 'destructive', onPress: () => onUnlink(link.id) }]);
  };
  return <><View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Family links</Text><Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>Link active athlete accounts with active parent/guardian accounts. Links only share basic profile and schedule access.</Text></View></View><View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.panelTitle, { color: colors.foreground }]}>Link a family</Text><View style={[styles.search, { backgroundColor: colors.background, borderColor: colors.border, marginHorizontal: 0, marginTop: 12 }]}><Feather name="search" size={16} color={colors.mutedForeground} /><TextInput testID="family-links-search" value={search} onChangeText={setSearch} placeholder="Search active athletes or parents" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View><Text style={[styles.formLabel, { color: colors.mutedForeground }]}>SELECT ATHLETE</Text><View style={styles.groupPeople}>{athletes.slice(0, 12).map((person) => <Pressable testID={`family-athlete-${person.id}`} key={person.id} onPress={() => onSelectAthlete(person.id)} style={[styles.groupPerson, { backgroundColor: selectedAthleteId === person.id ? `${colors.primary}18` : colors.background, borderColor: selectedAthleteId === person.id ? colors.primary : colors.border }]}><View><Text style={[styles.groupPersonName, { color: colors.foreground }]}>{person.fullName}</Text><Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>{person.teams.join(' · ') || 'No team assigned'}</Text></View><Feather name={selectedAthleteId === person.id ? 'check-circle' : 'circle'} size={17} color={selectedAthleteId === person.id ? colors.primary : colors.mutedForeground} /></Pressable>)}</View>{!athletes.length ? <Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>No active athlete accounts match this search.</Text> : null}<Text style={[styles.formLabel, { color: colors.mutedForeground, marginTop: 14 }]}>SELECT PARENT / GUARDIAN</Text><View style={styles.groupPeople}>{guardians.slice(0, 12).map((person) => <Pressable testID={`family-guardian-${person.id}`} key={person.id} onPress={() => onSelectGuardian(person.id)} style={[styles.groupPerson, { backgroundColor: selectedGuardianId === person.id ? `${colors.primary}18` : colors.background, borderColor: selectedGuardianId === person.id ? colors.primary : colors.border }]}><Text style={[styles.groupPersonName, { color: colors.foreground }]}>{person.fullName}</Text><Feather name={selectedGuardianId === person.id ? 'check-circle' : 'circle'} size={17} color={selectedGuardianId === person.id ? colors.primary : colors.mutedForeground} /></Pressable>)}</View>{!guardians.length ? <Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>No active parent/guardian accounts match this search.</Text> : null}<View style={[styles.callout, { backgroundColor: colors.secondary, marginTop: 14 }]}><Feather name="link" size={16} color={colors.primary} /><Text style={[styles.calloutText, { color: colors.foreground }]}>{selectedAthlete && selectedGuardian ? `${selectedAthlete.fullName} ↔ ${selectedGuardian.fullName}` : 'Select one athlete and one parent/guardian'}</Text></View><Pressable testID="create-family-link" disabled={!selectedAthleteId || !selectedGuardianId || saving} onPress={onLink} style={[styles.submit, { backgroundColor: selectedAthleteId && selectedGuardianId ? colors.primary : colors.muted, marginTop: 14 }]}>{saving ? <ActivityIndicator color="#fff" /> : <><Text style={styles.submitText}>Create family link</Text><Feather name="link" size={16} color="#fff" /></>}</Pressable></View><View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.panelTitle, { color: colors.foreground }]}>Current links</Text>{loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 18 }} /> : links.length ? <View style={[styles.groupPeople, { marginTop: 12 }]}>{links.map((link) => <View key={link.id} style={[styles.groupPerson, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.groupPersonName, { color: colors.foreground }]}>{link.athlete.fullName}</Text><Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>Parent/Guardian · {link.guardian.fullName}</Text></View><Pressable testID={`remove-family-link-${link.id}`} accessibilityLabel={`Remove family link for ${link.athlete.fullName}`} onPress={() => confirmUnlink(link)}><Feather name="unlink" size={17} color={colors.destructive} /></Pressable></View>)}</View> : <Text style={[styles.panelCopy, { color: colors.mutedForeground, marginTop: 8 }]}>No athlete and parent/guardian accounts are linked yet.</Text>}</View></>;
}
function RosterCard({ user, colors, roleMenuOpen, teamMenuOpen, gradYearMenuOpen, uploadingPhoto, deletingProfile, canDeleteProfile, onPhotoChange, onToggleRole, onToggleTeam, onToggleGradYear, onRoleChange, onTeamChange, onGradYearChange, onResend, onRevoke, onDeleteProfile }: { user: UserRow; colors: ReturnType<typeof useColors>; roleMenuOpen: boolean; teamMenuOpen: boolean; gradYearMenuOpen: boolean; uploadingPhoto: boolean; deletingProfile: boolean; canDeleteProfile: boolean; onPhotoChange: () => void; onToggleRole: () => void; onToggleTeam: () => void; onToggleGradYear: () => void; onRoleChange: (role: Role) => void; onTeamChange: (team: string) => void; onGradYearChange: (gradYear: string) => void; onResend: () => void; onRevoke: () => void; onDeleteProfile: () => void }) {
  const catalog = useTagCatalog().data;
  const queryClient = useQueryClient();
  const [roleTagOpen, setRoleTagOpen] = useState(false);
  const roleTagMutation = useUpdateUserRoleTag({ mutation: {
    onSuccess: () => {
      setRoleTagOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['/api/admin/users', 'live'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/users', 'roster'] });
    },
    onError: (error) => Alert.alert('Could not update role label', error.message),
  } });
  const initials = user.fullName.split(' ').map((name) => name[0]).join('').slice(0, 2);
  const displayRole = user.roleTag ? tagLabel(catalog, 'roles', user.roleTag) : roleLabel(user.role);
  const saveRoleTag = (roleTag: string | null) => roleTagMutation.mutate({ id: user.id, data: { roleTag } });
  const menu = (items: string[], kind: 'roles' | 'teams', selected: string | null, onPick: (value: string | null) => void) => <View style={[styles.roleMenu, { borderColor: colors.border, backgroundColor: colors.muted }]}>{items.map((item) => <Pressable key={item} onPress={() => onPick(item)} style={styles.roleOption}><Text style={[styles.roleOptionText, { color: item === selected ? colors.primary : colors.foreground }]}>{tagLabel(catalog, kind, item)}</Text>{item === selected ? <Feather name="check" size={14} color={colors.primary} /> : null}</Pressable>)}</View>;
  return <View style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Pressable testID={`edit-photo-${user.id}`} accessibilityLabel={`Change ${user.fullName} profile photo`} onPress={onPhotoChange} disabled={uploadingPhoto} style={[styles.initials, { backgroundColor: `${colors.primary}18` }]}>{user.profilePhotoUri ? <Image source={{ uri: user.profilePhotoUri }} resizeMode="cover" style={styles.userPhoto} /> : uploadingPhoto ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.initialsText, { color: colors.primary }]}>{initials}</Text>}</Pressable>
    <View style={{ flex: 1 }}><Text style={[styles.userName, { color: colors.foreground }]}>{user.fullName}</Text><Text style={[styles.userMeta, { color: colors.mutedForeground }]}>{user.email ?? user.phone ?? 'No contact'}</Text>
      <View style={styles.userFooter}><Text style={[styles.status, { color: user.status === 'active' ? colors.accent : colors.primary }]}>{user.status}</Text><Pressable testID={`role-menu-${user.id}`} onPress={onToggleRole}><Text style={[styles.roleText, { color: colors.primary }]}>Access: {roleLabel(user.role)} <Feather name="chevron-down" size={12} /></Text></Pressable><Pressable testID={`role-tag-menu-${user.id}`} onPress={() => setRoleTagOpen((open) => !open)}><Text style={[styles.roleText, { color: colors.primary }]}>Label: {displayRole} <Feather name={roleTagOpen ? "chevron-up" : "chevron-down"} size={12} /></Text></Pressable></View>
      {roleMenuOpen ? menu(roles, 'roles', user.role, (value) => value && onRoleChange(value as Role)) : null}
      <Pressable testID={`team-menu-${user.id}`} onPress={onToggleTeam} style={[styles.inlineTeamMenu, { borderColor: colors.border }]}><Text style={[styles.inlineTeamText, { color: colors.primary }]}>{tagLabel(catalog, 'teams', user.teams[0] ?? 'Assign team')}</Text><Feather name="chevron-down" size={12} color={colors.primary} /></Pressable>
      {teamMenuOpen ? menu(catalog.teams.map((option) => option.id), 'teams', user.teams[0] ?? null, onTeamChange) : null}
      <Pressable testID={`grad-year-menu-${user.id}`} onPress={onToggleGradYear} style={[styles.inlineTeamMenu, { borderColor: colors.border }]}><Text style={[styles.inlineTeamText, { color: colors.primary }]}>Grad year: {user.gradYear ? tagLabel(catalog, 'gradYears', user.gradYear) : 'Assign'}</Text></Pressable>
      {gradYearMenuOpen ? <View style={[styles.roleMenu, { borderColor: colors.border, backgroundColor: colors.muted }]}>{catalog.gradYears.map((option) => <Pressable key={option.id} onPress={() => onGradYearChange(option.id)} style={styles.roleOption}><Text style={[styles.roleOptionText, { color: option.id === user.gradYear ? colors.primary : colors.foreground }]}>{option.label}</Text></Pressable>)}</View> : null}
      {roleTagOpen ? <View style={styles.roleMenu}><Text style={[styles.formLabel, { color: colors.mutedForeground }]}>ROLE LABEL · DOES NOT CHANGE ACCESS</Text>{catalog.roles.map((option) => <Pressable key={option.id} onPress={() => saveRoleTag(option.id)} disabled={roleTagMutation.isPending} style={styles.roleOption}><Text style={[styles.roleOptionText, { color: option.id === user.roleTag ? colors.primary : colors.foreground }]}>{option.label}</Text></Pressable>)}<Pressable onPress={() => saveRoleTag(null)} disabled={roleTagMutation.isPending} style={styles.roleOption}><Text style={[styles.roleOptionText, { color: !user.roleTag ? colors.primary : colors.mutedForeground }]}>Use access role</Text></Pressable></View> : null}
      {canDeleteProfile ? <Pressable testID={`delete-profile-${user.id}`} accessibilityRole="button" accessibilityLabel={`Delete ${user.fullName}'s profile`} disabled={deletingProfile} onPress={onDeleteProfile} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 11, paddingVertical: 4 }}><Feather name="trash-2" size={13} color={colors.destructive} /><Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 11 }}>{deletingProfile ? 'Deleting profile…' : 'Delete profile'}</Text></Pressable> : null}
    </View>{user.status === 'invited' ? <View style={styles.inviteActions}><Pressable onPress={onResend} style={styles.rowIcon}><Feather name="send" size={15} color={colors.accent} /></Pressable><Pressable onPress={onRevoke} style={styles.rowIcon}><Feather name="x" size={16} color={colors.mutedForeground} /></Pressable></View> : null}
  </View>;
}
function ScheduleImagesPanel({ colors, images, uploading, onUpload }: { colors: ReturnType<typeof useColors>; images: Record<string, { uri: string; width?: number; height?: number }>; uploading: string | null; onUpload: (kind: 'weekly-schedule' | 'lunch-program') => void }) {
  const cards = [{ kind: 'weekly-schedule' as const, title: 'Weekly LPA Schedule', copy: 'Upload the current weekly training and classroom schedule.' }, { kind: 'lunch-program' as const, title: 'Student Athlete Lunch', copy: 'Upload the current daily lunch program image.' }];
  return <><View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Schedule images</Text><Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>These images appear for every signed-in LPA user.</Text></View></View><View style={styles.scheduleAdminGrid}>{cards.map((card) => { const image = images[card.kind]; return <View key={card.kind} style={[styles.scheduleAdminCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.panelTitle, { color: colors.foreground }]}>{card.title}</Text><Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>{card.copy}</Text>{image ? <Image source={{ uri: image.uri }} resizeMode="contain" style={[styles.schedulePreview, { aspectRatio: image.width && image.height ? image.width / image.height : 1.6 }]} /> : <View style={[styles.schedulePlaceholder, { backgroundColor: colors.muted }]}><Feather name="image" size={23} color={colors.mutedForeground} /><Text style={[styles.panelCopy, { color: colors.mutedForeground }]}>Using bundled default image</Text></View>}<Pressable testID={`upload-${card.kind}`} disabled={uploading === card.kind} onPress={() => onUpload(card.kind)} style={[styles.submit, { backgroundColor: colors.primary }]}>{uploading === card.kind ? <ActivityIndicator color="#fff" /> : <><Feather name="upload" size={16} color="#fff" /><Text style={styles.submitText}>Upload image</Text></>}</Pressable></View>; })}</View></>;
}
function RosterFilterDropdown({ label, value, options, onChange, colors, testID, display = (item: string) => item }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; colors: ReturnType<typeof useColors>; testID: string; display?: (value: string) => string }) {
  const [open, setOpen] = useState(false);
  return <View style={{ marginBottom: 12 }}><Text style={[styles.formLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text><Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`Filter roster by ${label}`} onPress={() => setOpen((visible) => !visible)} style={[styles.teamSelect, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.teamSelectText, { color: colors.foreground }]}>{display(value)}</Text><Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} /></Pressable>{open ? <View style={[styles.teamSelectMenu, { borderColor: colors.border, backgroundColor: colors.card }]}>{options.map((option) => <Pressable key={option} onPress={() => { onChange(option); setOpen(false); }} style={styles.teamSelectOption}><Text style={[styles.teamSelectText, { color: option === value ? colors.primary : colors.foreground }]}>{display(option)}</Text>{option === value ? <Feather name="check" size={15} color={colors.primary} /> : null}</Pressable>)}</View> : null}</View>;
}
function InviteForm({ invite, setInvite, onSubmit, loading, colors }: { invite: { fullName: string; email: string; phone: string; role: Role; team: string; gradYear: string }; setInvite: React.Dispatch<React.SetStateAction<{ fullName: string; email: string; phone: string; role: Role; team: string; gradYear: string }>>; onSubmit: () => void; loading: boolean; colors: ReturnType<typeof useColors> }) {
  const catalog = useTagCatalog().data;
  return <View style={styles.form}>
    <Field value={invite.fullName} onChangeText={(fullName) => setInvite((value) => ({ ...value, fullName }))} placeholder="Full name" colors={colors} />
    <Field value={invite.email} onChangeText={(email) => setInvite((value) => ({ ...value, email }))} placeholder="Email address" autoCapitalize="none" colors={colors} />
    <Field value={invite.phone} onChangeText={(phone) => setInvite((value) => ({ ...value, phone }))} placeholder="Mobile number" colors={colors} />
    <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>ROLE</Text>
    <ChoiceRow options={roles} value={invite.role} onChange={(role) => setInvite((value) => ({ ...value, role: role as Role }))} colors={colors} label={roleLabel} />
    <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>ROLE LABEL (OPTIONAL)</Text>
    <ChoiceRow options={['', ...catalog.roles.map((option) => option.id)]} value={invite.roleTag || ''} onChange={(roleTag) => setInvite((value) => ({ ...value, roleTag }))} colors={colors} label={(id) => id ? tagLabel(catalog, 'roles', id) : 'Use access role'} />
    <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TEAM</Text>
    <TeamDropdown value={invite.team} onChange={(team) => setInvite((value) => ({ ...value, team }))} colors={colors} testID="dashboard-invite-team" />
    <RosterFilterDropdown label="Grad year" value={invite.gradYear || 'Select graduation year'} options={catalog.gradYears.map((option) => option.id)} display={(value) => tagLabel(catalog, 'gradYears', value)} onChange={(gradYear) => setInvite((value) => ({ ...value, gradYear }))} colors={colors} testID="dashboard-invite-grad-year" />
    <Pressable testID="dashboard-send-invite" onPress={onSubmit} disabled={loading || !invite.fullName || (!invite.email && !invite.phone) || !invite.team} style={[styles.submit, { backgroundColor: invite.fullName && (invite.email || invite.phone) && invite.team ? colors.primary : colors.muted }]}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.submitText}>Send invitation</Text><Feather name="send" size={16} color="#fff" /></>}</Pressable>
  </View>;
}
function EventForm({ title, setTitle, date, setDate, time, setTime, endTime, setEndTime, location, setLocation, team, setTeam, repeatUntil: currentRepeatUntil, onSubmit, loading, edit, colors }: { title: string; setTitle: (value: string) => void; date: string; setDate: (value: string) => void; time: string; setTime: (value: string) => void; endTime: string; setEndTime: (value: string) => void; location: string; setLocation: (value: string) => void; team: string; setTeam: (value: string) => void; repeatUntil?: string | null; onSubmit: (repeatDaily: boolean, repeatUntil: string, applyToRemainingRepeatEvents: boolean) => void; loading: boolean; edit: boolean; colors: ReturnType<typeof useColors> }) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePicker, setTimePicker] = useState<'start' | 'end' | null>(null);
  const [repeatDaily, setRepeatDaily] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [repeatDatePickerOpen, setRepeatDatePickerOpen] = useState(false);
  const [applyToRemainingRepeatEvents, setApplyToRemainingRepeatEvents] = useState(false);
  return <View style={styles.form}>
    <Field value={title} onChangeText={setTitle} placeholder="Event title" colors={colors} />
    <Pressable testID="dashboard-event-date" accessibilityRole="button" accessibilityLabel="Choose event date" onPress={() => setDatePickerOpen(true)} style={[styles.pickerButton, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Feather name="calendar" size={16} color={date ? colors.primary : colors.mutedForeground} />
      <Text style={[styles.pickerButtonText, { color: date ? colors.foreground : colors.mutedForeground }]}>{date || 'Date (MM-DD-YYYY)'}</Text>
      <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
    </Pressable>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable testID="dashboard-event-start-time" accessibilityRole="button" accessibilityLabel="Choose start time" onPress={() => setTimePicker('start')} style={[styles.pickerButton, styles.halfPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Feather name="clock" size={15} color={time ? colors.primary : colors.mutedForeground} />
        <Text style={[styles.pickerButtonText, { color: time ? colors.foreground : colors.mutedForeground }]}>{time || 'Start time'}</Text>
      </Pressable>
      <Pressable testID="dashboard-event-end-time" accessibilityRole="button" accessibilityLabel="Choose end time" onPress={() => setTimePicker('end')} style={[styles.pickerButton, styles.halfPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Feather name="clock" size={15} color={endTime ? colors.primary : colors.mutedForeground} />
        <Text style={[styles.pickerButtonText, { color: endTime ? colors.foreground : colors.mutedForeground }]}>{endTime || 'End time'}</Text>
      </Pressable>
    </View>
    <Field value={location} onChangeText={setLocation} placeholder="Location" colors={colors} />
    {!edit ? <><Pressable testID="dashboard-event-repeat-daily" accessibilityRole="checkbox" accessibilityState={{ checked: repeatDaily }} onPress={() => setRepeatDaily((enabled) => !enabled)} style={[styles.repeatRow, { backgroundColor: repeatDaily ? `${colors.primary}18` : colors.background, borderColor: repeatDaily ? colors.primary : colors.border }]}><View style={[styles.repeatCheckbox, { borderColor: repeatDaily ? colors.primary : colors.mutedForeground, backgroundColor: repeatDaily ? colors.primary : 'transparent' }]}>{repeatDaily ? <Feather name="check" size={13} color="#fff" /> : null}</View><View style={{ flex: 1 }}><Text style={[styles.repeatTitle, { color: colors.foreground }]}>Multi-day event</Text><Text style={[styles.repeatCopy, { color: colors.mutedForeground }]}>Show one event from its start date through its end date.</Text></View><Feather name={repeatDaily ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} /></Pressable>{repeatDaily ? <Pressable testID="dashboard-event-repeat-until" accessibilityRole="button" accessibilityLabel="Choose event end date" onPress={() => setRepeatDatePickerOpen(true)} style={[styles.pickerButton, { backgroundColor: colors.background, borderColor: colors.border }]}><Feather name="calendar" size={16} color={repeatUntil ? colors.primary : colors.mutedForeground} /><Text style={[styles.pickerButtonText, { color: repeatUntil ? colors.foreground : colors.mutedForeground }]}>{repeatUntil || 'End date (MM-DD-YYYY)'}</Text><Feather name="chevron-down" size={16} color={colors.mutedForeground} /></Pressable> : null}</> : null}
     {edit && currentRepeatUntil ? <Pressable testID="dashboard-event-apply-repeat-updates" accessibilityRole="checkbox" accessibilityState={{ checked: applyToRemainingRepeatEvents }} onPress={() => setApplyToRemainingRepeatEvents((enabled) => !enabled)} style={[styles.repeatRow, { backgroundColor: applyToRemainingRepeatEvents ? `${colors.primary}18` : colors.background, borderColor: applyToRemainingRepeatEvents ? colors.primary : colors.border }]}><View style={[styles.repeatCheckbox, { borderColor: applyToRemainingRepeatEvents ? colors.primary : colors.mutedForeground, backgroundColor: applyToRemainingRepeatEvents ? colors.primary : 'transparent' }]}>{applyToRemainingRepeatEvents ? <Feather name="check" size={13} color="#fff" /> : null}</View><View style={{ flex: 1 }}><Text style={[styles.repeatTitle, { color: colors.foreground }]}>Apply to all remaining repeat events</Text><Text style={[styles.repeatCopy, { color: colors.mutedForeground }]}>Updates this event and every later event in the repeat through the Until date ({displayDate(currentRepeatUntil)}).</Text></View></Pressable> : null}
    <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TEAM</Text>
     <CalendarChoiceRow options={teams.filter((item) => item !== 'All Teams')} value={team} onChange={setTeam} colors={colors} />
    <Pressable testID="dashboard-save-event" onPress={() => onSubmit(repeatDaily, repeatUntil, applyToRemainingRepeatEvents)} disabled={loading || !title || !date || !time || (repeatDaily && !repeatUntil)} style={[styles.submit, { backgroundColor: title && date && time && (!repeatDaily || repeatUntil) ? colors.primary : colors.muted }]}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.submitText}>{edit ? 'Save changes' : 'Create event'}</Text><Feather name="calendar" size={16} color="#fff" /></>}</Pressable>
    <DatePickerModal visible={datePickerOpen} value={date} onClose={() => setDatePickerOpen(false)} onChange={setDate} colors={colors} />
     <DatePickerModal visible={repeatDatePickerOpen} value={repeatUntil} initialDate={date} onClose={() => setRepeatDatePickerOpen(false)} onChange={setRepeatUntil} colors={colors} />
    <TimePickerModal visible={timePicker !== null} value={timePicker === 'end' ? endTime : time} title={timePicker === 'end' ? 'Choose end time' : 'Choose start time'} onClose={() => setTimePicker(null)} onChange={timePicker === 'end' ? setEndTime : setTime} colors={colors} />
  </View>;
}

const pad = (value: number) => String(value).padStart(2, '0');
const displayDateFromParts = (date: Date) => `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()}`;
const dateFromDisplay = (value: string) => {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  return date.getFullYear() === Number(match[3]) && date.getMonth() === Number(match[1]) - 1 && date.getDate() === Number(match[2]) ? date : null;
};

function PickerSheet({ visible, title, onClose, colors, children }: { visible: boolean; title: string; onClose: () => void; colors: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.pickerBackdrop}><View style={[styles.pickerSheet, { backgroundColor: colors.card }]}><View style={styles.pickerHeader}><View><Text style={[styles.formLabel, { color: colors.primary }]}>CALENDAR</Text><Text style={[styles.pickerTitle, { color: colors.foreground }]}>{title}</Text></View><Pressable testID="close-picker" accessibilityRole="button" accessibilityLabel="Close picker" onPress={onClose}><Feather name="x" size={20} color={colors.mutedForeground} /></Pressable></View>{children}</View></View></Modal>;
}

function DatePickerModal({ visible, value, initialDate, onClose, onChange, colors }: { visible: boolean; value: string; initialDate?: string; onClose: () => void; onChange: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  const today = new Date();
  const [monthStart, setMonthStart] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  useEffect(() => {
    if (visible) {
      const selected = dateFromDisplay(value) ?? dateFromDisplay(initialDate ?? '');
      setMonthStart(selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 1));
    }
  }, [visible, value, initialDate]);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const leadingDays = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((leadingDays + daysInMonth) / 7) * 7 }, (_, index) => index - leadingDays + 1);
  const selected = dateFromDisplay(value);
  return <PickerSheet visible={visible} title="Choose event date" onClose={onClose} colors={colors}><View style={styles.monthPickerHeader}><Pressable testID="date-picker-previous-month" onPress={() => setMonthStart(new Date(year, month - 1, 1))} style={styles.pickerIcon}><Feather name="chevron-left" size={18} color={colors.primary} /></Pressable><Text style={[styles.monthPickerTitle, { color: colors.foreground }]}>{monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text><Pressable testID="date-picker-next-month" onPress={() => setMonthStart(new Date(year, month + 1, 1))} style={styles.pickerIcon}><Feather name="chevron-right" size={18} color={colors.primary} /></Pressable></View><View style={styles.weekdayPickerRow}>{['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => <Text key={day} style={[styles.weekdayPickerText, { color: colors.mutedForeground }]}>{day}</Text>)}</View><View style={styles.datePickerGrid}>{cells.map((day, index) => { const active = day > 0 && day <= daysInMonth; const date = active ? new Date(year, month, day) : null; const isSelected = Boolean(date && selected && date.getFullYear() === selected.getFullYear() && date.getMonth() === selected.getMonth() && date.getDate() === selected.getDate()); return <Pressable key={`${year}-${month}-${index}`} disabled={!active} testID={active ? `date-picker-day-${day}` : undefined} onPress={() => { if (date) { onChange(displayDateFromParts(date)); onClose(); } }} style={[styles.datePickerCell, isSelected && { backgroundColor: colors.primary }]}><Text style={[styles.datePickerDay, { color: isSelected ? '#fff' : active ? colors.foreground : colors.muted }]}>{active ? day : ''}</Text></Pressable>; })}</View><Pressable onPress={() => { onChange(displayDateFromParts(today)); onClose(); }} style={[styles.todayButton, { borderColor: colors.border }]}><Text style={[styles.todayButtonText, { color: colors.primary }]}>Today</Text></Pressable></PickerSheet>;
}

function TimePickerModal({ visible, value, title, onClose, onChange, colors }: { visible: boolean; value: string; title: string; onClose: () => void; onChange: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  const slots = Array.from({ length: 48 }, (_, index) => {
    const hour24 = Math.floor(index / 2);
    const minute = index % 2 === 0 ? '00' : '30';
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${minute} ${suffix}`;
  });
  return <PickerSheet visible={visible} title={title} onClose={onClose} colors={colors}><ScrollView style={styles.timePickerList} showsVerticalScrollIndicator={false}>{slots.map((slot) => <Pressable key={slot} testID={`time-picker-${slot.replace(/[: ]/g, '-')}`} onPress={() => { onChange(slot); onClose(); }} style={[styles.timePickerOption, { borderBottomColor: colors.border }, slot === value && { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.timePickerText, { color: slot === value ? colors.primary : colors.foreground }]}>{slot}</Text>{slot === value ? <Feather name="check" size={17} color={colors.primary} /> : null}</Pressable>)}</ScrollView></PickerSheet>;
}
function Field({ value, onChangeText, placeholder, colors, autoCapitalize }: { value: string; onChangeText: (value: string) => void; placeholder: string; colors: ReturnType<typeof useColors>; autoCapitalize?: 'none' }) { return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} autoCapitalize={autoCapitalize} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />; }
function TeamDropdown({ value, onChange, colors, testID }: { value: string; onChange: (value: string) => void; colors: ReturnType<typeof useColors>; testID: string }) {
  const [open, setOpen] = useState(false);
  const catalog = useTagCatalog().data;
  return <View><Pressable testID={testID} onPress={() => setOpen((visible) => !visible)} style={[styles.teamSelect, { borderColor: colors.border, backgroundColor: colors.background }]}><Text style={[styles.teamSelectText, { color: value ? colors.foreground : colors.mutedForeground }]}>{value ? tagLabel(catalog, 'teams', value) : 'Choose a team'}</Text><Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} /></Pressable>{open ? <View style={[styles.teamSelectMenu, { borderColor: colors.border, backgroundColor: colors.card }]}>{catalog.teams.map((option) => <Pressable key={option.id} onPress={() => { onChange(option.id); setOpen(false); }} style={styles.teamSelectOption}><Text style={[styles.teamSelectText, { color: option.id === value ? colors.primary : colors.foreground }]}>{option.label}</Text>{option.id === value ? <Feather name="check" size={15} color={colors.primary} /> : null}</Pressable>)}</View> : null}</View>;
}
function ChoiceRow({ options, value, onChange, colors, label = (option: string) => option }: { options: readonly string[]; value: string; onChange: (value: string) => void; colors: ReturnType<typeof useColors>; label?: (option: string) => string }) { return <View style={styles.choiceRow}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.choice, { backgroundColor: option === value ? colors.primary : colors.muted, borderColor: option === value ? colors.primary : colors.border }]}><Text style={[styles.choiceText, { color: option === value ? '#fff' : colors.foreground }]}>{label(option)}</Text></Pressable>)}</View>; }
function CalendarChoiceRow({ options, value, onChange, colors }: { options: readonly string[]; value: string; onChange: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  const catalog = useTagCatalog().data;
  const dynamic = catalog.teams.map((option) => option.id);
  return <View style={styles.choiceRow}>{dynamic.map((option) => { const selected = canonicalTeam(catalog, value) === option; const optionColor = getTeamColor(catalog, option); const label = tagLabel(catalog, 'teams', option); return <Pressable key={option} onPress={() => onChange(option)} style={[styles.choice, { backgroundColor: selected ? optionColor : colors.muted, borderColor: selected ? optionColor : colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }]}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: optionColor }} /><Text style={[styles.choiceText, { color: selected && option === 'LPA' ? colors.accentForeground : selected ? '#fff' : colors.foreground }]}>{label}</Text></Pressable>; })}</View>;
}
type EditableTagKind = 'roles' | 'teams' | 'gradYears';
type PendingTagChange = { action: 'rename' | 'delete'; kind: EditableTagKind; id: string; oldLabel: string; newLabel?: string };

function TagCatalogPanel({ colors, catalog, error, unavailable, onCreate, onRename, onDelete }: {
  colors: ReturnType<typeof useColors>;
  catalog: TagCatalog;
  error: string;
  unavailable: boolean;
  onCreate: (kind: EditableTagKind, label: string) => void;
  onRename: (kind: EditableTagKind, id: string, label: string) => void;
  onDelete: (kind: EditableTagKind, id: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTagChange | null>(null);
  const labels: Record<EditableTagKind, string> = { roles: 'Roles', teams: 'Teams', gradYears: 'Graduation years' };
  const confirm = () => {
    if (!pending) return;
    if (unavailable) { setPending(null); return; }
    if (pending.action === 'rename' && pending.newLabel) {
      onRename(pending.kind, pending.id, pending.newLabel);
      setEditing(null);
    } else if (pending.action === 'delete') {
      onDelete(pending.kind, pending.id);
      if (editing === `${pending.kind}:${pending.id}`) setEditing(null);
    }
    setPending(null);
  };

  return <>
    <View style={styles.sectionHeader}>
      <View>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tagging</Text>
        <Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>Manage labels used throughout the LPA community. Tags in use cannot be deleted.</Text>
      </View>
    </View>
    {error ? <Text style={{ color: colors.destructive, marginBottom: 10 }}>{error}</Text> : null}
    {(['roles', 'teams', 'gradYears'] as const).map((kind) => (
      <View key={kind} style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.panelTitle, { color: colors.foreground }]}>{labels[kind]}</Text>
        <View style={styles.groupPeople}>
          {catalog[kind].map((option) => {
            const key = `${kind}:${option.id}`;
            const value = drafts[key] ?? option.label;
            return <View key={option.id} style={[styles.roleOption, { gap: 12 }]}>
              <TextInput value={value} onChangeText={(text) => setDrafts((current) => ({ ...current, [key]: text }))}
                editable={!unavailable && editing === key} accessibilityLabel={`${option.label} tag name`}
                style={[styles.input, { flex: 1, height: 38, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
              <Pressable testID={`edit-tag-${key}`} accessibilityRole="button" accessibilityLabel={editing === key ? `Save ${option.label}` : `Edit ${option.label}`} disabled={unavailable} style={{ paddingVertical: 8, opacity: unavailable ? 0.5 : 1 }}
                onPress={() => {
                  if (editing !== key) { setEditing(key); return; }
                  if (!value.trim()) return;
                  if (value.trim() !== option.label) setPending({ action: 'rename', kind, id: option.id, oldLabel: option.label, newLabel: value.trim() });
                  else setEditing(null);
                }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{editing === key ? 'Save' : 'Edit'}</Text>
              </Pressable>
              <Pressable testID={`delete-tag-${key}`} accessibilityRole="button" accessibilityLabel={`Delete ${option.label}`} disabled={unavailable} style={{ paddingVertical: 8, opacity: unavailable ? 0.5 : 1 }}
                onPress={() => setPending({ action: 'delete', kind, id: option.id, oldLabel: option.label })}>
                <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 12 }}>Delete</Text>
              </Pressable>
            </View>;
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TextInput placeholder={`New ${labels[kind].toLowerCase().replace(/s$/, '')}`}
            placeholderTextColor={colors.mutedForeground} value={drafts[kind] ?? ''} editable={!unavailable}
            onChangeText={(text) => setDrafts((current) => ({ ...current, [kind]: text }))}
            style={[styles.input, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
          <Pressable disabled={unavailable} onPress={() => {
            const value = drafts[kind]?.trim();
            if (value) { onCreate(kind, value); setDrafts((current) => ({ ...current, [kind]: '' })); }
          }} style={[styles.smallButton, { backgroundColor: colors.primary, opacity: unavailable ? 0.5 : 1 }]}>
            <Text style={styles.smallButtonText}>Add</Text>
          </Pressable>
        </View>
      </View>
    ))}
    <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={() => setPending(null)}>
      <View style={{ flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 400, padding: 22, borderRadius: 18, backgroundColor: colors.card }}>
          <Text style={[styles.panelTitle, { color: colors.foreground }]}>
            {pending?.action === 'delete' ? 'Delete this tag?' : 'Save this tag change?'}
          </Text>
          <Text style={[styles.panelCopy, { color: colors.mutedForeground, marginTop: 10, marginBottom: 22 }]}>
            {pending?.action === 'delete'
              ? `Delete “${pending.oldLabel}”? This removes it from tag choices. Tags assigned to people or events cannot be deleted.`
              : `Change “${pending?.oldLabel}” to “${pending?.newLabel}”? The updated name will appear throughout the app.`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Pressable testID="tag-change-no" accessibilityRole="button" onPress={() => setPending(null)}
              style={[styles.smallButton, { backgroundColor: colors.muted }]}><Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold' }}>No</Text></Pressable>
            <Pressable testID="tag-change-yes" accessibilityRole="button" onPress={confirm}
              style={[styles.smallButton, { backgroundColor: pending?.action === 'delete' ? colors.destructive : colors.primary }]}><Text style={styles.smallButtonText}>Yes</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 18 }, header: { flexDirection: 'row', justifyContent: 'space-between', gap: 18, marginBottom: 24 }, headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, headerActions: { flexDirection: 'row', gap: 8 }, syncStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 }, syncDot: { width: 7, height: 7, borderRadius: 4 }, syncText: { fontFamily: 'Inter_500Medium', fontSize: 10 }, kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, marginBottom: 7 }, title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.8 }, subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 7 }, iconButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, logoutButton: { height: 40, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, logoutText: { fontFamily: 'Inter_700Bold', fontSize: 12 }, nav: { borderRadius: 15, padding: 3, marginBottom: 18 }, navContent: { flexDirection: 'row', gap: 3 }, navButton: { minWidth: 108, alignItems: 'center', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10 }, navText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, statGrid: { flexDirection: 'row', gap: 9, marginBottom: 12 }, stat: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 13, minHeight: 112 }, statIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, statValue: { fontFamily: 'Inter_700Bold', fontSize: 24 }, statLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 }, panel: { borderRadius: 19, borderWidth: 1, padding: 15, marginBottom: 12 }, panelHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }, panelTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 }, panelCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 }, actionIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, callout: { height: 50, borderRadius: 14, paddingHorizontal: 13, alignItems: 'center', flexDirection: 'row', gap: 10 }, calloutText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 }, quickActions: { gap: 9 }, quickAction: { height: 49, paddingHorizontal: 13, borderRadius: 14, alignItems: 'center', flexDirection: 'row', gap: 10 }, quickActionText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 }, form: { gap: 9 }, input: { height: 46, borderRadius: 13, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontFamily: 'Inter_400Regular', fontSize: 13 }, formLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1, marginTop: 3 }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 }, choiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 }, submit: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 3 }, submitText: { fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 12 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 }, sectionCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, smallButton: { height: 38, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, smallButtonText: { fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 11 }, search: { height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }, searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12 }, roster: { gap: 8 }, userCard: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, initials: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, userPhoto: { width: '100%', height: '100%' }, initialsText: { fontFamily: 'Inter_700Bold', fontSize: 11 }, userName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, userMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14 }, userFooter: { flexDirection: 'row', gap: 11, alignItems: 'center', marginTop: 7 }, status: { fontFamily: 'Inter_700Bold', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }, roleText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 }, roleMenu: { borderWidth: 1, borderRadius: 11, overflow: 'hidden', marginTop: 8 }, roleOption: { minHeight: 33, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, roleOptionText: { fontFamily: 'Inter_500Medium', fontSize: 11 }, inviteActions: { flexDirection: 'row', gap: 7, paddingTop: 2 }, rowIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, teamFilters: { gap: 7, paddingBottom: 13 }, teamPill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }, teamText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, eventList: { gap: 8 }, eventCard: { borderRadius: 17, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, eventDate: { width: 45, height: 45, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, eventDay: { fontFamily: 'Inter_700Bold', fontSize: 11 }, eventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, eventMeta: { fontFamily: 'Inter_400Regular', fontSize: 10 }, eventTeam: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5, marginTop: 5 }, repeatSeriesMeta: { fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 4 }, eventActions: { gap: 14 }, cancel: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, denied: { flex: 1, alignItems: 'center', paddingHorizontal: 30 }, deniedIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 17 }, deniedTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, textAlign: 'center' }, deniedCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 9 }, backButton: { height: 46, borderRadius: 14, paddingHorizontal: 20, justifyContent: 'center', marginTop: 23 }, backButtonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 }, scheduleAdminGrid: { gap: 12 }, scheduleAdminCard: { borderWidth: 1, borderRadius: 18, padding: 15 }, schedulePreview: { width: '100%', marginTop: 13, backgroundColor: '#000', borderRadius: 12 }, schedulePlaceholder: { width: '100%', aspectRatio: 1.6, marginTop: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 7 },
});
Object.assign(styles, StyleSheet.create({
  pickerButton: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  halfPicker: { flex: 1, minWidth: 0 },
  pickerButtonText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  repeatRow: { minHeight: 58, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  repeatCheckbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  repeatTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  repeatCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  pickerBackdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 30, maxHeight: '88%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 19 },
  pickerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 4 },
  pickerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  monthPickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthPickerTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  weekdayPickerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  weekdayPickerText: { width: '14.2857%', textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5 },
  datePickerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  datePickerCell: { width: '14.2857%', height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  datePickerDay: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  todayButton: { minHeight: 43, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  todayButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  timePickerList: { maxHeight: 410 },
  timePickerOption: { minHeight: 47, borderBottomWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timePickerText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
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