import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
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
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return { expoPushToken: token.data, platform: Platform.OS };
}

export async function setApplicationBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.setBadgeCountAsync(Math.max(0, Math.trunc(count)));
}

export function addPushResponseListener(listener: (data: { conversationId?: string, messageId?: string, announcementId?: string }) => void) {
  if (Platform.OS === 'web') return { remove: () => undefined };
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
    const messageId = typeof data?.messageId === 'string' ? data.messageId : undefined;
    const announcementId = typeof data?.announcementId === 'string' ? data.announcementId : undefined;
    if (conversationId || announcementId) listener({ conversationId, messageId, announcementId });
  });
}

export function addPushReceivedListener(listener: (input: { conversationId?: string; messageId?: string; announcementId?: string; title: string; body: string }) => void) {
  if (Platform.OS === 'web') return { remove: () => undefined };
  return Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
    const announcementId = typeof data?.announcementId === 'string' ? data.announcementId : undefined;
    if (!conversationId && !announcementId) return;
    listener({
      conversationId,
      messageId: typeof data?.messageId === 'string' ? data.messageId : undefined,
      announcementId,
      title: notification.request.content.title ?? 'New notification',
      body: notification.request.content.body ?? 'You have a new notification.',
    });
  });
}