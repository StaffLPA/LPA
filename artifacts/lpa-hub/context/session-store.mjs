export const SESSION_TOKEN_KEY = 'lpa-session-token';
export const ACTIVE_USER_KEY = 'lpa-active-user';

export async function loadStoredSession(storage) {
  const entries = await storage.multiGet([ACTIVE_USER_KEY, SESSION_TOKEN_KEY]);
  const values = Object.fromEntries(entries);
  const rawUser = values[ACTIVE_USER_KEY];
  const token = values[SESSION_TOKEN_KEY];

  if (!rawUser || !token) return null;

  try {
    return { user: JSON.parse(rawUser), token };
  } catch {
    return null;
  }
}

export function persistStoredSession(storage, user, token) {
  return storage.multiSet([
    [SESSION_TOKEN_KEY, token],
    [ACTIVE_USER_KEY, JSON.stringify(user)],
  ]);
}

export function clearStoredSession(storage, userId) {
  return storage.multiRemove([
    ACTIVE_USER_KEY,
    SESSION_TOKEN_KEY,
    userId ? `lpa-push-token:${userId}` : 'lpa-push-token',
  ]);
}