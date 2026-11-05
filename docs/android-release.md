# Android release preparation — LPA 1.0.6, version code 9

## Changes in this release
- Android uses the same OneSignal notification path as iPhone for messages, mentions, announcements, and Forms notifications.
- Native registration no longer depends on an Expo token. Older installed Expo clients keep their delivery path.
- Android notifications use the high-importance `messages` channel with sound, vibration, and supported launcher badges.
- Taps retain navigation to their message, announcement, or Forms item.
- Signing out pauses native push; registering a different account transfers the device and removes its previous cached registration.

## Required release order
1. Publish the updated API before distributing the new app. Older published servers reject Android OneSignal registrations and the new native device key.
2. In the existing OneSignal app, open **Settings → Push & In-App → Google Android (FCM)**. Confirm Firebase HTTP v1 is enabled and its service account is configured for this app.
   - Upload Firebase **service-account private keys only to OneSignal**. Never put them in the repository, app, release notes, or chat.
   - The owner reports that OneSignal now shows Android FCM setup complete. The integration cannot inspect/manage this credential setting; native delivery still needs testing.
   - Firebase's Android client `google-services.json` is supplied and referenced by `expo.android.googleServicesFile`. Its Android package matches `com.legendaryprepacademy.lpa`. This is client configuration, not a service-account private key.
3. Run `pnpm run check:android-release`, the mobile/server typechecks, and `CI=1 pnpm exec expo install --check` from the mobile directory. The source preflight explicitly reports checks it cannot verify.
   - Expo 57's recommended patch packages have been aligned and both root and standalone mobile lockfiles refreshed. Installation used a command-scoped package-age exception for this patch alignment; the workspace's permanent 24-hour policy remains unchanged.
    - Expo Doctor reports the existing `react-native-render-html` dependency as unmaintained. Its other checks pass; replacement is separate from SDK patch alignment.
    - Android release builds enable R8 code optimization/obfuscation and resource shrinking via the SDK-matched `expo-build-properties` plugin. Keep the generated ProGuard mapping file as a downloadable cloud-build artifact and upload it to Play Console with the AAB.
    - Keep `expo`, `react`, and `react-native` in runtime `dependencies`, not `devDependencies`. Otherwise Expo prebuild adds them again and the cloud worker starts an unlocked reinstall, which can reject fresh SDK patches under the 24-hour package-age policy. Validate Android prebuild in a temporary copy and require that it leaves the manifest unchanged.
4. Confirm **9 is greater than every version code already uploaded to Play Console**. Keep the existing application ID and release signing identity.
5. Use the connected Expo service's Android build operation with the `production` profile and automatic submission disabled. Build from the exact verified GitHub release commit, preferably on an isolated release branch when `main` lags behind the intended app source. A queued build is not a finished AAB; obtain the artifact only after Expo reports success.
6. Install the signed release from a Play internal-testing track on a physical Android phone. Allow notifications, check OneSignal's Android subscription is enabled, then send a test only to that authorized test account/device.
7. Verify foreground, background, and closed-app receipt; sound; tap navigation; messages/mentions; announcements; and Forms when appropriate. Check denied permission, re-enabling permission in Android settings, sign-out, account switching, and upgrade from the previous app. A browser/Expo Go test cannot validate Android FCM delivery.
8. Ensure the Google review account is active/unlocked and its Play Console sign-in details work before resubmitting.

Suggested Google Play release notes:
> Updated Android notifications for LPA messages, mentions, announcements, and requests. Improved notification registration and account-switching behavior.

## Current limitations
Source checks and automated tests are not proof of provider credentials, release signing, real-device delivery, or Google approval. Firebase setup and native delivery must be confirmed before treating this release as ready to distribute. Android 15 edge-to-edge deprecation warnings currently originate in React Native and AndroidX/Material libraries; removing them requires a separately validated Expo SDK upgrade.
