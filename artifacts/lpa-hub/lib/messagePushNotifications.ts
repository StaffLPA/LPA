import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export type RegisteredPushToken = { expoPushToken: string; platform: 'ios' | 'android' };

export async function requestMessagePushToken(): Promise<RegisteredPushToken | null> {
  if (Platform.OS === 'web' || !Device.isDevice || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;

  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return { expoPushToken: token.data, platform: Platform.OS };
}

export function addPushResponseListener(listener: (conversationId: string, messageId?: string) => void) {
  if (Platform.OS === 'web') return { remove: () => undefined };
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : '';
    const messageId = typeof data?.messageId === 'string' ? data.messageId : undefined;
    if (conversationId) listener(conversationId, messageId);
  });
}

export function addPushReceivedListener(listener: (input: { conversationId: string; messageId?: string; title: string; body: string }) => void) {
  if (Platform.OS === 'web') return { remove: () => undefined };
  return Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : '';
    if (!conversationId) return;
    listener({
      conversationId,
      messageId: typeof data?.messageId === 'string' ? data.messageId : undefined,
      title: notification.request.content.title ?? 'New message',
      body: notification.request.content.body ?? 'You have a new message.',
    });
  });
}