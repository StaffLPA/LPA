type Contact = { name: string; role: string; email?: string; partner?: boolean };
type Member = { id: string; fullName: string; role: string; status: string; contactDirectoryKey?: string | null };
const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Prefer the server's email identity; support exact names on older APIs or different login emails. */
export function matchDirectoryContact<T extends Member>(contact: Contact, members: T[]): T[] {
  const eligible = members.filter((member) => member.status === 'active' && (contact.partner || member.role === 'Staff-Coach'));
  const key = contact.email ? normalize(contact.email) : '';
  const linked = key ? eligible.filter((member) => member.contactDirectoryKey && normalize(member.contactDirectoryKey) === key) : [];
  const expectedName = normalize(contact.partner ? contact.role : contact.name);
  // Never override an explicit link to a different contact or guess using partial names.
  const matches = linked.length ? linked : eligible.filter((member) => !member.contactDirectoryKey && normalize(member.fullName) === expectedName);
  return [...new Map(matches.map((member) => [member.id, member])).values()];
}
