import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkAndroidRelease } from './check-android-release.mjs';

function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'android-release-test-'));
  const mobile = path.join(root, 'artifacts/lpa-hub');
  mkdirSync(path.join(mobile, 'vendor'), { recursive: true });
  const config = {
    expo: { version: '1.0.6', android: { package: 'com.legendaryprepacademy.lpa', versionCode: 8 },
      plugins: [['onesignal-expo-plugin', { mode: 'production' }]] },
  };
  const save = () => writeFileSync(path.join(mobile, 'app.json'), JSON.stringify(config));
  save();
  writeFileSync(path.join(mobile, 'eas.json'), JSON.stringify({ build: { production: { android: { buildType: 'app-bundle' } } } }));
  writeFileSync(path.join(mobile, 'package.json'), JSON.stringify({ dependencies: {
    expo: '~57.0.32', react: '19.2.3', 'react-native': '0.86.3',
    'react-native-onesignal': '5.5.14', '@workspace/api-client-react': 'file:vendor/client.tgz',
  } }));
  writeFileSync(path.join(mobile, 'vendor/client.tgz'), 'fixture');
  writeFileSync(path.join(mobile, 'pnpm-lock.yaml'), 'fixture');
  try { run({ root, mobile, config, save }); } finally { rmSync(root, { recursive: true, force: true }); }
}
test('preflight distinguishes source readiness from unverified provider and device setup', () => fixture(({ root }) => {
  const result = checkAndroidRelease(root);
  assert.equal(result.versionCode, 8);
  assert.match(result.warnings.join(' '), /real-device delivery/);
  assert.match(result.warnings.join(' '), /No google-services/);
}));
test('preflight rejects old Android version codes and application ID changes', () => fixture(({ root, config, save }) => {
  config.expo.android.versionCode = 7; save();
  assert.throws(() => checkAndroidRelease(root), /versionCode/);
  config.expo.android.versionCode = 8;
  config.expo.android.package = 'wrong.package'; save();
  assert.throws(() => checkAndroidRelease(root), /application ID/);
}));
test('preflight rejects core packages declared only as development dependencies', () => fixture(({ root, mobile }) => {
  writeFileSync(path.join(mobile, 'package.json'), JSON.stringify({
    dependencies: { 'react-native-onesignal': '5.5.14' },
    devDependencies: { expo: '~57.0.32', react: '19.2.3', 'react-native': '0.86.3' },
  }));
  assert.throws(() => checkAndroidRelease(root), /expo must be a runtime dependency/);
}));
test('Firebase client configuration must match the app, not another Android app', () => fixture(({ root, mobile, config, save }) => {
  config.expo.android.googleServicesFile = './google-services.json'; save();
  const firebase = { project_info: { project_number: '123' }, client: [
    { client_info: { android_client_info: { package_name: 'wrong.package' } } },
  ] };
  writeFileSync(path.join(mobile, 'google-services.json'), JSON.stringify(firebase));
  assert.throws(() => checkAndroidRelease(root), /Firebase client configuration/);
  firebase.client[0].client_info.android_client_info.package_name = config.expo.android.package;
  writeFileSync(path.join(mobile, 'google-services.json'), JSON.stringify(firebase));
  assert.equal(checkAndroidRelease(root).warnings.length, 1);
}));
