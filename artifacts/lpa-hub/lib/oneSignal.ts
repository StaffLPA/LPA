import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { LogLevel, NotificationClickEvent, NotificationWillDisplayEvent, PushSubscriptionChangedState } from 'react-native-onesignal';

const APP_ID = 'f1be55cc-1695-4309-85d4-bca6845a76ca';
type OneSignalSDK = typeof import('react-native-onesignal')['OneSignal'];

let sdk: OneSignalSDK | null | undefined;
let initialized = false;

function getSDK(): OneSignalSDK | null {
  // The native module is not part of Expo Go or the web bundle.
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  if (sdk !== undefined) return sdk;
  try {
    sdk = (require('react-native-onesignal') as typeof import('react-native-onesignal')).OneSignal;
  } catch (error) {
    console.warn('OneSignal requires a native build with its Expo plugin.', error);
    sdk = null;
  }
  return sdk;
}

function ensureInitialized(): OneSignalSDK | null {
  const oneSignal = getSDK();
  if (oneSignal && !initialized) {
    try {
      oneSignal.initialize(APP_ID);
      initialized = true;
    } catch (error) {
      console.warn('Unable to initialize OneSignal in this native build.', error);
      sdk = null;
      return null;
    }
  }
  return oneSignal;
}

export function hasOneSignalNativeModule(): boolean {
  return Boolean(getSDK());
}

export function startOneSignal(onSubscriptionChanged: (subscriptionId: string | null) => void): () => void {
  const oneSignal = ensureInitialized();
  if (!oneSignal) return () => undefined;

  let active = true;
  const checkId = (id: string | null | undefined) => {
    if (!active) return;
    const validId = typeof id === 'string' && id.trim().length > 0 && !id.startsWith('local-')
      ? id
      : null;
    onSubscriptionChanged(validId);
  };
  const onChange = (event: PushSubscriptionChangedState) => checkId(event.current.id);
  oneSignal.User.pushSubscription.addEventListener('change', onChange);
  void oneSignal.User.pushSubscription.getIdAsync().then(checkId).catch((error: unknown) => {
    console.warn('Unable to check the OneSignal push subscription.', error);
    checkId(null);
  });
  return () => {
    active = false;
    oneSignal.User.pushSubscription.removeEventListener('change', onChange);
  };
}

export function addOneSignalNotificationClickListener(
  listener: (notification: { data: Record<string, unknown>; title: string; body: string }) => void,
): { remove: () => void } {
  const oneSignal = ensureInitialized();
  if (!oneSignal) return { remove: () => undefined };
  const onClick = (event: NotificationClickEvent) => {
    const notification = event.notification;
    listener({
      data: (notification.additionalData ?? {}) as Record<string, unknown>,
      title: notification.title ?? 'New notification',
      body: notification.body ?? 'You have a new notification.',
    });
  };
  oneSignal.Notifications.addEventListener('click', onClick);
  return { remove: () => oneSignal.Notifications.removeEventListener('click', onClick) };
}

export function addOneSignalNotificationForegroundListener(
  listener: (notification: { data: Record<string, unknown>; title: string; body: string }) => void,
): { remove: () => void } {
  const oneSignal = ensureInitialized();
  if (!oneSignal) return { remove: () => undefined };
  const onForeground = (event: NotificationWillDisplayEvent) => {
    const notification = event.notification;
    listener({
      data: (notification.additionalData ?? {}) as Record<string, unknown>,
      title: notification.title ?? 'New notification',
      body: notification.body ?? 'You have a new notification.',
    });
    // OneSignal owns foreground presentation. Do not display a second copy.
  };
  oneSignal.Notifications.addEventListener('foregroundWillDisplay', onForeground);
  return { remove: () => oneSignal.Notifications.removeEventListener('foregroundWillDisplay', onForeground) };
}

export function loginOneSignal(userId: string): void {
  ensureInitialized()?.login(userId);
}

export function logoutOneSignal(): void {
  getSDK()?.logout();
}

export function pauseOneSignalPush(): void {
  getSDK()?.User.pushSubscription.optOut();
}

export function resumeOneSignalPush(): void {
  ensureInitialized()?.User.pushSubscription.optIn();
}

export async function requestOneSignalPermission(): Promise<boolean> {
  return (await getSDK()?.Notifications.requestPermission(true)) ?? false;
}

export function addOneSignalEmail(email: string): void {
  getSDK()?.User.addEmail(email);
}

export function addOneSignalSms(number: string): void {
  getSDK()?.User.addSms(number);
}

export function addOneSignalTag(key: string, value: string): void {
  getSDK()?.User.addTag(key, value);
}

export function setOneSignalLogLevel(level: LogLevel): void {
  getSDK()?.Debug.setLogLevel(level);
}