import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function checkAndroidRelease(root = workspace) {
  const mobile = path.join(root, 'artifacts/lpa-hub');
  const readJSON = file => JSON.parse(readFileSync(file, 'utf8'));
  const { expo } = readJSON(path.join(mobile, 'app.json'));
  const { build } = readJSON(path.join(mobile, 'eas.json'));
  const pkg = readJSON(path.join(mobile, 'package.json'));
  assert.equal(expo.android?.package, 'com.legendaryprepacademy.lpa', 'Preserve the existing Google Play application ID');
  assert.ok(Number.isSafeInteger(expo.android.versionCode) && expo.android.versionCode >= 8, 'Android versionCode must be at least 8');
  assert.equal(build.production?.android?.buildType, 'app-bundle', 'Google Play release must use an Android App Bundle');
  assert.equal(expo.plugins[0]?.[0], 'onesignal-expo-plugin', 'OneSignal plugin must remain first');
  assert.ok(pkg.dependencies['react-native-onesignal'], 'OneSignal native dependency is required');
  for (const name of ['expo', 'react', 'react-native']) {
    assert.ok(pkg.dependencies[name], `${name} must be a runtime dependency so Expo prebuild does not trigger an unlocked cloud reinstall`);
    assert.equal(pkg.devDependencies?.[name], undefined, `${name} must not be duplicated in devDependencies`);
  }
  for (const name of ['app.config.js', 'app.config.ts']) {
    assert.equal(existsSync(path.join(mobile, name)), false, 'Keep the static Expo app.json configuration');
  }
  const client = pkg.dependencies['@workspace/api-client-react'];
  assert.ok(client.startsWith('file:vendor/'), 'Standalone releases need the packed API client');
  assert.ok(existsSync(path.join(mobile, client.slice(5))), 'Packed API client must exist');
  assert.ok(existsSync(path.join(mobile, 'pnpm-lock.yaml')), 'Standalone frozen lockfile must exist');
  const warnings = [];
  if (expo.android.googleServicesFile) {
    const firebase = readJSON(path.resolve(mobile, expo.android.googleServicesFile));
    assert.ok(firebase.client?.some(client =>
      client.client_info?.android_client_info?.package_name === expo.android.package),
    'Firebase client configuration must match the Android application ID');
    assert.ok(firebase.project_info?.project_number, 'Firebase project number is required');
  } else {
    warnings.push('No google-services.json is configured. Confirm the supported OneSignal FCM configuration before building; add client configuration from the same Firebase project when available.');
  }
  warnings.push('Expo SDK dependency compatibility, OneSignal Android FCM credentials, highest Play Console version code, signing, native build, and real-device delivery require release verification.');
  return { version: expo.version, versionCode: expo.android.versionCode, packageName: expo.android.package, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkAndroidRelease();
    console.log(`Android source preflight passed: ${result.version} (${result.versionCode}), ${result.packageName}, App Bundle profile.`);
    result.warnings.forEach(warning => console.warn(`UNVERIFIED: ${warning}`));
    console.log('No Android binary was built or submitted.');
  } catch (error) {
    console.error(`Android source preflight failed: ${error.message}`);
    process.exitCode = 1;
  }
}
