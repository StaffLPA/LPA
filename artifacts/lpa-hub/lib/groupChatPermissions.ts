export function canManageGroupChats(role?: string | null) {
  return role === 'Admin' || role === 'Staff-Coach';
}

export function groupChatCreationProblem({ role, name, participantCount, rosterLoading = false, rosterFailed = false }: {
  role?: string | null; name: string; participantCount: number; rosterLoading?: boolean; rosterFailed?: boolean;
}) {
  if (!canManageGroupChats(role)) return 'Only Admin and Staff-Coach users can create group chats.';
  if (!name.trim()) return 'Enter a group name, then tap Create group chat.';
  if (name.trim().length > 100) return 'Keep the group name to 100 characters or fewer.';
  if (rosterLoading) return 'Members are still loading. Please wait a moment.';
  if (rosterFailed) return 'Members could not load. Tap Retry members, then try again.';
  if (!participantCount) return 'Select at least one member. Filters narrow the list; tap a person to add them.';
  return null;
}
