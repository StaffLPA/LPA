import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { removeDevicePushRegistrations } from '../lib/pushRegistrationCleanup.ts';

const subscriptionId = '12345678-1234-4234-8234-123456789abc';

function loadModule(file, mocks) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const runtime = { exports: {}, console, require: (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(code, runtime);
  return runtime.exports;
}

function fixture(platform, { native = true, storeClient = false, permission = true } = {}) {
  const events = {};
  const calls = { initialized: 0, expoTokens: 0, expoPermission: 0, handler: 0, channels: [], clicked: [], foreground: [] };
  const sdk = {
    initialize: () => calls.initialized++,
    login: () => {},
    logout: () => {},
    User: { pushSubscription: {
      getIdAsync: async () => subscriptionId,
      addEventListener: (name, fn) => { events[name] = fn; },
      removeEventListener: (name) => { delete events[name]; },
      optIn: () => {}, optOut: () => {},
    } },
    Notifications: {
      addEventListener: (name, fn) => { events[name] = fn; },
      removeEventListener: (name) => { delete events[name]; },
      requestPermission: async () => permission,
    },
  };
  const constants = { executionEnvironment: storeClient ? 'storeClient' : 'standalone', easConfig: { projectId: 'fixture' } };
  const mocks = {
    'expo-constants': { __esModule: true, default: constants, ExecutionEnvironment: { StoreClient: 'storeClient' } },
    'react-native': { Platform: { OS: platform } },
    'react-native-onesignal': native ? { OneSignal: sdk } : undefined,
  };
  if (!native) Object.defineProperty(mocks, 'react-native-onesignal', { get() { throw new Error('Native SDK unavailable'); } });
  const oneSignal = loadModule('../lib/oneSignal.ts', mocks);
  const notifications = {
    AndroidImportance: { HIGH: 4 },
    setNotificationHandler: () => { calls.handler++; },
    setNotificationChannelAsync: async (id, config) => { calls.channels.push({ id, config }); },
    getPermissionsAsync: async () => ({ granted: permission }),
    requestPermissionsAsync: async () => { calls.expoPermission++; return { granted: permission }; },
    getExpoPushTokenAsync: async () => { calls.expoTokens++; return { data: 'ExpoPushToken[fixture]' }; },
  };
  const push = loadModule('../lib/messagePushNotifications.ts', {
    'expo-constants': { __esModule: true, default: constants },
    'expo-device': { isDevice: true },
    'expo-notifications': notifications,
    'react-native': { Platform: { OS: platform } },
    '@/lib/oneSignal': oneSignal,
  });
  return { calls, events, oneSignal, push };
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: native push registers without any Expo token or Expo permission dependency`, async () => {
    const { oneSignal, push, calls } = fixture(platform);
    assert.equal(oneSignal.hasOneSignalNativeModule(), true);
    assert.equal(await push.requestMessagePushToken(null), null);
    const registration = await push.requestMessagePushToken(subscriptionId);
    assert.equal(registration.platform, platform);
    assert.equal(registration.expoPushToken, `OneSignalPushToken[${subscriptionId}]`);
    assert.equal(calls.expoTokens, 0);
    assert.equal(calls.expoPermission, 0);
    assert.equal(calls.handler, 0, 'Expo must not also present native OneSignal notifications');
    if (platform === 'android') {
      assert.equal(calls.channels[0].id, 'messages');
      assert.equal(calls.channels[0].config.importance, 4);
      assert.equal(calls.channels[0].config.sound, 'default');
    }
  });

  test(`${platform}: OneSignal initializes, reports subscriptions, and handles notification taps and foreground events`, async () => {
    const { oneSignal, calls, events } = fixture(platform);
    const ids = [];
    const stop = oneSignal.startOneSignal(id => ids.push(id));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ids[0], subscriptionId);
    events.change({ current: { id: null } });
    assert.equal(ids[1], null);
    const clicks = oneSignal.addOneSignalNotificationClickListener(n => calls.clicked.push(n));
    const foreground = oneSignal.addOneSignalNotificationForegroundListener(n => calls.foreground.push(n));
    const notification = { title: 'Coach', body: 'Update', additionalData: { conversationId: 'chat' } };
    events.click({ notification });
    events.foregroundWillDisplay({ notification });
    assert.equal(calls.clicked[0].data.conversationId, 'chat');
    assert.equal(calls.foreground[0].title, 'Coach');
    assert.equal(calls.initialized, 1);
    assert.equal(await oneSignal.requestOneSignalPermission(), true);
    stop(); clicks.remove(); foreground.remove();
    assert.equal(Object.keys(events).length, 0);
  });

  test(`${platform}: Expo Go retains legacy Expo registration and respects denied permission`, async () => {
    const allowed = fixture(platform, { storeClient: true });
    assert.equal(allowed.oneSignal.hasOneSignalNativeModule(), false);
    const token = await allowed.push.requestMessagePushToken();
    assert.equal(token.expoPushToken, 'ExpoPushToken[fixture]');
    assert.equal(allowed.calls.handler, 1);
    const denied = fixture(platform, { storeClient: true, permission: false });
    assert.equal(await denied.push.requestMessagePushToken(), null);
    assert.equal(denied.calls.expoTokens, 0);
  });
}

test('web never loads the native SDK or registers push', async () => {
  const { oneSignal, push, calls } = fixture('web');
  assert.equal(oneSignal.hasOneSignalNativeModule(), false);
  assert.equal(await push.requestMessagePushToken(subscriptionId), null);
  assert.equal(calls.initialized, 0);
});

test('sign-out removes both new native and cached legacy registrations during an interrupted migration', async () => {
  const removed = [];
  await removeDevicePushRegistrations(
    { expoPushToken: `OneSignalPushToken[${subscriptionId}]` },
    Promise.resolve(JSON.stringify({ platform: 'android', expoPushToken: 'ExpoPushToken[old]' })),
    async key => { removed.push(key); },
  );
  assert.deepEqual(removed, [`OneSignalPushToken[${subscriptionId}]`, 'ExpoPushToken[old]']);
});

test('sign-out deduplicates registrations and still cleans up with a corrupt cache', async () => {
  const removed = [];
  const candidate = { expoPushToken: `OneSignalPushToken[${subscriptionId}]` };
  await removeDevicePushRegistrations(candidate, Promise.resolve(JSON.stringify({ ...candidate, platform: 'ios' })), async key => { removed.push(key); });
  assert.equal(removed.length, 1);
  await removeDevicePushRegistrations(candidate, Promise.resolve('invalid json'), async key => { removed.push(key); });
  assert.equal(removed.length, 2);
});

test('a failed removal does not stop cleanup of the other registration', async () => {
  const removed = [];
  await assert.rejects(removeDevicePushRegistrations(
    { expoPushToken: 'OneSignalPushToken[new]' },
    Promise.resolve(JSON.stringify({ platform: 'android', expoPushToken: 'ExpoPushToken[old]' })),
    async key => { removed.push(key); if (key.startsWith('OneSignal')) throw new Error('fixture failure'); },
  ), /could not be removed/);
  assert.equal(removed.length, 2);
});
