export const EVERYONE_MENTION_ID = 'everyone';
export const EVERYONE_DISPLAY_NAME = 'everyone';

type ChatLike = { type: string };
const isStaff = (role?: string | null) => role === 'Admin' || role === 'Staff-Coach';

/** Every conversation member may send photos and files. */
export function canSendChatAttachments(_chat?: ChatLike | null, _role?: string | null) {
  return true;
}

/** Any group member may use @everyone (never in direct messages). Ignores obsolete server flags. */
export function canUseEveryoneMention(chat: ChatLike | null | undefined, _role?: string | null) {
  return chat?.type === 'group';
}

/** Only Admin and Staff-Coach members may change a group's profile photo. */
export function canChangeGroupPhoto(chat: ChatLike | null | undefined, role?: string | null) {
  return chat?.type === 'group' && isStaff(role);
}

export function everyoneMatchesPrefix(prefix: string) {
  return EVERYONE_DISPLAY_NAME.startsWith(prefix.toLocaleLowerCase());
}

export function isEveryoneMention(userId: string) {
  return userId === EVERYONE_MENTION_ID;
}
