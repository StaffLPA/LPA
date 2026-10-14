import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  addOneSignalNotificationClickListener,
  addOneSignalNotificationForegroundListener,
  hasOneSignalNativeModule,
} from '@/lib/oneSignal';

// The OneSignal native SDK presents its own iOS notifications. Do not ask
// expo-notifications to present the same foreground APNs event a second time.
if (Platform.OS !== 'web' && !(Platform.OS === 'ios' && hasOneSignalNativeModule())) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export type RegisteredPushToken = { expoPushToken: string; platform: 'ios' | 'android' };

export async function requestMessagePushToken(): Promise<RegisteredPushToken | null> {
  if (Platform.OS === 'web' || !Device.isDevice || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'LPA updates',
      description: 'Alerts for LPA announcements, direct messages, and group messages.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  // On iOS native builds, OneSignal's subscription dialog owns permission.
  // Keep the Expo flow for Expo Go and older builds without OneSignal.
  const oneSignalOwnsPermission = Platform.OS === 'ios' && hasOneSignalNativeModule();
  const permissionGranted = existing.granted
    || oneSignalOwnsPermission
    || (await Notifications.requestPermissionsAsync()).granted;
  if (!permissionGranted) return null;

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return { expoPushToken: token.data, platform: Platform.OS };
}

export async function setApplicationBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.setBadgeCountAsync(Math.max(0, Math.trunc(count)));
}

function extractPushData(data: Record<string, unknown> | null | undefined) {
  const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
  const messageId = typeof data?.messageId === 'string' ? data.messageId : undefined;
  const announcementId = typeof data?.announcementId === 'string' ? data.announcementId : undefined;
  const formSubmissionId = typeof data?.formSubmissionId === 'string' && /^[0-9a-f-]{36}$/.test(data.formSubmissionId) ? data.formSubmissionId : undefined;
  return { conversationId, messageId, announcementId, formSubmissionId };
}
let handledResponseId: string | undefined;

export function addPushResponseListener(listener: (data: { conversationId?: string, messageId?: string, announcementId?: string, formSubmissionId?: string }) => void) {
  if (Platform.OS === 'web') return { remove: () => undefined };
  let active = true;
  const handleResponse = (response: Notifications.NotificationResponse | null) => {
    if (!active || !response || handledResponseId === response.notification.request.identifier) return;
    const data = response.notification.request.content.data;
    const pushData = extractPushData(data);
    if (pushData.conversationId || pushData.announcementId || pushData.formSubmissionId) {
      handledResponseId = response.notification.request.identifier;
      listener(pushData);
    }
  };
  const expoSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
  void Notifications.getLastNotificationResponseAsync().then(handleResponse).catch(() => undefined);
  const oneSignalSubscription = addOneSignalNotificationClickListener((notification) => {
    const pushData = extractPushData(notification.data);
    if (pushData.conversationId || pushData.announcementId || pushData.formSubmissionId) listener(pushData);
  });
  return { remove: () => { active = false; expoSubscription.remove(); oneSignalSubscription.remove(); } };
}

export function addPushReceivedListener(listener: (input: { conversationId?: string; messageId?: string; announcementId?: string; formSubmissionId?: string; title: string; body: string }) => void) {
  if (Platform.OS === 'web') return { remove: () => undefined };
  const handleNotification = (data: Record<string, unknown> | null | undefined, title: string, body: string) => {
    const pushData = extractPushData(data);
    if (!pushData.conversationId && !pushData.announcementId && !pushData.formSubmissionId) return;
    listener({
      ...pushData,
      title,
      body,
    });
  };
  const expoSubscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    handleNotification(data, notification.request.content.title ?? 'New notification', notification.request.content.body ?? 'You have a new notification.');
  });
  const oneSignalSubscription = addOneSignalNotificationForegroundListener((notification) => {
    handleNotification(notification.data, notification.title, notification.body);
  });
  return { remove: () => { expoSubscription.remove(); oneSignalSubscription.remove(); } };
}