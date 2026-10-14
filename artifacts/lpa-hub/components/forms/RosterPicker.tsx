import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getListUsersQueryKey, useListUsers } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Chip } from './common';

export function useActiveRoster(roles: string[], athletesOnly = false, enabled = true) {
  const q = useListUsers(undefined, { query: { queryKey: getListUsersQueryKey(), enabled } });
  const people = useMemo(() => (q.data ?? []).filter((u) => String(u.status).toLowerCase() === 'active' &&
    (athletesOnly ? u.role === 'Athlete' || u.roleTag === 'Athlete' : roles.includes(u.role))), [athletesOnly, q.data, roles]);
  return { people, query: q };
}

const COACH_ROLES = ['Staff-Coach'];
export function RosterPicker({ label, selected, onChange, roles = COACH_ROLES, testID, allowedEmails }: { label: string; selected: string[]; onChange: (ids: string[]) => void; roles?: string[]; testID?: string; allowedEmails?: readonly string[] }) {
  const c = useColors();
  const { people: roster, query } = useActiveRoster(roles);
  const people = allowedEmails ? roster.filter((p) => allowedEmails.includes(p.email?.trim().toLowerCase() ?? '')) : roster;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return <View testID={testID} style={{ marginBottom: 14 }}>
    <Text style={[st.label, { color: c.mutedForeground }]}>{label}</Text>
    {query.isLoading ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Loading roster...</Text> : query.isError ? <Text style={{ color: c.destructive, fontSize: 12 }}>Roster could not load.</Text> : people.length === 0 ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>No active staff found.</Text> :
      <View style={st.wrap}>{people.map((p) => <Chip key={p.id} testID={`${testID ?? 'roster'}-${p.id}`} label={p.fullName} selected={selected.includes(p.id)} onPress={() => toggle(p.id)} />)}</View>}
  </View>;
}
const st = StyleSheet.create({ label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.6, marginBottom: 8 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
