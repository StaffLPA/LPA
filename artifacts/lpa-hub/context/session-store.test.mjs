import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACTIVE_USER_KEY,
  SESSION_TOKEN_KEY,
  clearStoredSession,
  loadStoredSession,
  persistStoredSession,
} from './session-store.mjs';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async multiGet(keys) {
      return keys.map((key) => [key, values.get(key) ?? null]);
    },
    async multiSet(entries) {
      entries.forEach(([key, value]) => values.set(key, value));
    },
    async multiRemove(keys) {
      keys.forEach((key) => values.delete(key));
    },
  };
}

test('rehydrates a cached user and bearer token independently of API availability', async () => {
  const user = { id: 'staff-1', fullName: 'Coach One', role: 'Staff-Coach' };
  const storage = createStorage();

  await persistStoredSession(storage, user, 'expired-token');
  const restored = await loadStoredSession(storage);

  assert.deepEqual(restored, { user, token: 'expired-token' });
  assert.equal(storage.values.get(SESSION_TOKEN_KEY), 'expired-token');
  assert.deepEqual(JSON.parse(storage.values.get(ACTIVE_USER_KEY)), user);
});

test('explicit session clearing removes the stored user, token, and user push token', async () => {
  const storage = createStorage({
    [ACTIVE_USER_KEY]: '{"id":"staff-1"}',
    [SESSION_TOKEN_KEY]: 'token',
    'lpa-push-token:staff-1': '{"expoPushToken":"push-token"}',
  });

  await clearStoredSession(storage, 'staff-1');

  assert.equal(storage.values.size, 0);
});