import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSharedSyncCoordinator,
  startSharedSyncTriggers,
} from './live-sync-coordinator.mjs';

const user = { id: 'staff-1', fullName: 'Coach One' };

test('revalidates active queries and clears a retryable error after a later success', async () => {
  let profileAttempts = 0;
  let activeQueryRefetches = 0;
  const states = [];
  const updatedProfiles = [];
  let shouldFail = true;
  const sync = createSharedSyncCoordinator({
    hasSession: () => true,
    refreshProfile: async () => {
      profileAttempts += 1;
      if (shouldFail) throw new Error('offline');
      return user;
    },
    refetchActiveQueries: async () => {
      activeQueryRefetches += 1;
    },
    onProfile: (nextUser) => updatedProfiles.push(nextUser),
    onStateChange: (state) => states.push(state),
  });

  await sync();
  assert.equal(profileAttempts, 1);
  assert.equal(activeQueryRefetches, 1);
  assert.ok(states.some((state) => state.syncError));
  assert.equal(states.at(-1).isSyncing, false);

  shouldFail = false;
  await sync();
  assert.equal(profileAttempts, 2);
  assert.equal(activeQueryRefetches, 2);
  assert.deepEqual(updatedProfiles, [user]);
  assert.ok(states.some((state) => state.lastSyncedAt instanceof Date));
  assert.ok(states.some((state) => state.syncError === null));
  assert.deepEqual(states.at(-2), { lastSyncedAt: states.at(-2).lastSyncedAt });
  assert.equal(states.at(-1).isSyncing, false);
});

test('refreshes without waiting for a timer when the app returns to foreground or browser focus', async () => {
  const listeners = new Map();
  const appState = {
    addEventListener: (event, listener) => {
      listeners.set(`app:${event}`, listener);
      return { remove: () => listeners.delete(`app:${event}`) };
    },
  };
  const windowRef = {
    addEventListener: (event, listener) => listeners.set(`window:${event}`, listener),
    removeEventListener: (event) => listeners.delete(`window:${event}`),
  };
  const documentRef = {
    visibilityState: 'visible',
    addEventListener: (event, listener) => listeners.set(`document:${event}`, listener),
    removeEventListener: (event) => listeners.delete(`document:${event}`),
  };
  let refreshes = 0;
  const sync = async () => {
    refreshes += 1;
  };
  const intervals = [];
  const stop = startSharedSyncTriggers({
    sync,
    appState,
    platform: 'web',
    windowRef,
    documentRef,
    intervalMs: 5000,
    setIntervalFn: (callback) => {
      intervals.push(callback);
      return callback;
    },
    clearIntervalFn: () => {},
  });

  await Promise.resolve();
  listeners.get('app:change')('active');
  listeners.get('window:focus')();
  listeners.get('document:visibilitychange')();
  await Promise.resolve();

  assert.equal(intervals.length, 1);
  assert.equal(refreshes, 4);
  stop();
  assert.equal(listeners.size, 0);
});