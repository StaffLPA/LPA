import { useQueryClient } from '@tanstack/react-query';
import { useUpdateChatMute } from '@workspace/api-client-react';

type MutedChat = { id: string; isMuted: boolean };

export function useChatMute() {
  const queryClient = useQueryClient();
  const mutation = useUpdateChatMute();

  const toggleMute = (chat: MutedChat, onError: () => void) => {
    if (mutation.isPending) return;
    const next = !chat.isMuted;
    void queryClient.cancelQueries({ queryKey: ['chats'] }).then(() => {
      const update = (isMuted: boolean) => queryClient.setQueryData<MutedChat[]>(['chats'], (current) =>
        current?.map((item) => item.id === chat.id ? { ...item, isMuted } : item));
      update(next);
      mutation.mutate({ conversationId: chat.id, data: { isMuted: next } }, {
        onSuccess: (result) => {
          update(result.isMuted);
          void queryClient.invalidateQueries({ queryKey: ['chats'] });
        },
        onError: () => {
          update(chat.isMuted);
          onError();
        },
      });
    });
  };

  return { toggleMute, isPending: mutation.isPending };
}