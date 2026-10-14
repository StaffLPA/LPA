import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import { useListChats, getListAnnouncementsQueryKey, getListAdminAnnouncementsQueryKey } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { addPushReceivedListener, addPushResponseListener, setApplicationBadgeCount } from '@/lib/messagePushNotifications';

type Chat = {
  unreadCount: number;
};

export function MessageNotificationCenter() {
  const { user } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const chats = useListChats({ query: { queryKey: ['chats'], enabled: Boolean(user), refetchInterval: 10_000 } });
  const unreadCount = ((chats.data ?? []) as Chat[]).reduce((total, chat) => total + chat.unreadCount, 0);

  useEffect(() => {
    if (user && chats.data === undefined) return;
    void setApplicationBadgeCount(user ? unreadCount : 0).catch(() => undefined);
  }, [chats.data, unreadCount, user]);

  useEffect(() => {
    const invalidateChat = (conversationId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      if (pathname === `/chat/${conversationId}`) void queryClient.invalidateQueries({ queryKey: ['chat-messages', conversationId] });
    };
    const response = addPushResponseListener((data) => {
      if (data.formSubmissionId) {
        const target = `/forms/${data.formSubmissionId}`;
        void queryClient.invalidateQueries({ queryKey: ['/api/forms/submissions'] });
        router.push(target as never);
      } else if (data.conversationId) {
        invalidateChat(data.conversationId);
        router.push(('/chat/' + data.conversationId) as never);
      } else if (data.announcementId) {
        router.push(`/?announcementId=${data.announcementId}` as never);
      }
    });
    const received = addPushReceivedListener((notification) => {
      if (notification.formSubmissionId) {
        void queryClient.invalidateQueries({ queryKey: ['/api/forms/submissions'] });
        void queryClient.invalidateQueries({ queryKey: ['/api/forms/notifications'] });
        void queryClient.invalidateQueries({ queryKey: ['chats'] });
      } else if (notification.conversationId) {
        invalidateChat(notification.conversationId);
      } else if (notification.announcementId) {
        void queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
      }
    });
    return () => { response.remove(); received.remove(); };
  }, [pathname, queryClient, router]);

  return null;
}