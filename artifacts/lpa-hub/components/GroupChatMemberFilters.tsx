import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

const MEMBER_ROLES = [
  { id: 'Parent-Athlete', label: 'Parents' },
  { id: 'Athlete', label: 'Athletes' },
  { id: 'Staff-Coach', label: 'Staff/Coaches' },
  { id: 'Admin', label: 'Admins' },
];

export function GroupChatMemberFilters({ groups = [], selectedGroup = null, onGroupChange, selectedRoles = [], onRolesChange }: {
  groups?: { id: string; label: string }[];
  selectedGroup?: string | null;
  onGroupChange?: (group: string | null) => void;
  selectedRoles?: string[];
  onRolesChange?: (roles: string[]) => void;
}) {
  const colors = useColors();
  const chip = (id: string, label: string, selected: boolean, onPress: () => void) =>
    <Pressable key={id} testID={id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}>
      <Text style={[styles.text, { color: selected ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
    </Pressable>;
  return <View>
    {onRolesChange ? <>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Filter members</Text>
      <View style={styles.row}>
        {chip('member-role-all', 'All members', selectedRoles.length === 0, () => onRolesChange([]))}
        {MEMBER_ROLES.map((role) => chip(`member-role-${role.id}`, role.label, selectedRoles.includes(role.id), () =>
          onRolesChange(selectedRoles.includes(role.id) ? selectedRoles.filter((id) => id !== role.id) : [...selectedRoles, role.id])))}
      </View>
    </> : null}
    {onGroupChange ? <>
    <Text style={[styles.label, { color: colors.mutedForeground }]}>Filter by group</Text>
    <View style={styles.row}>
      {chip('member-group-all', 'All groups', selectedGroup === null, () => onGroupChange(null))}
      {groups.map((group) => chip(`member-group-${group.id}`, group.label, selectedGroup === group.id, () => onGroupChange(group.id)))}
      {chip('member-group-unassigned', 'Unassigned', selectedGroup === '', () => onGroupChange(''))}
    </View>
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 10, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { minHeight: 34, borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, justifyContent: 'center' },
  text: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
});
