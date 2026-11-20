type GroupMember = { id: string; groupTag?: string | null };
type FamilyLink = { athlete: { id: string }; guardian: { id: string } };

export function matchesMemberRole(role: string, selectedRoles: string[]) {
  return selectedRoles.length === 0 || selectedRoles.includes(role);
}

/** Staff-only membership filtering; a guardian follows their linked athletes. */
export function matchesMemberGroup(person: GroupMember, selectedGroup: string | null, roster: GroupMember[], links: FamilyLink[] = []) {
  if (selectedGroup === null) return true;
  const groups = new Set<string>();
  if (person.groupTag) groups.add(person.groupTag);
  for (const link of links) {
    if (link.guardian.id !== person.id) continue;
    const group = roster.find((athlete) => athlete.id === link.athlete.id)?.groupTag;
    if (group) groups.add(group);
  }
  return selectedGroup === '' ? groups.size === 0 : groups.has(selectedGroup);
}
