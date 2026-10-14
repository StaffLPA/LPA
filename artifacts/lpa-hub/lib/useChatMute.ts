import { useQueryClient } from '@tanstack/react-query';
import { useUpdateChatMute } from '@workspace/api-client-react';

export type ChatMuteMode = 'unmuted' | 'all' | 'mentions';
export type MutedChat = { id: string; isMuted: boolean; muteMode?: ChatMuteMode };

export function getChatMuteMode(chat: MutedChat): ChatMuteMode {
  return chat.muteMode ?? (chat.isMuted ? 'all' : 'unmuted');
}

export function useChatMute() {
  const queryClient = useQueryClient();
  const mutation = useUpdateChatMute();

  const setMuteMode = (chat: MutedChat, mode: ChatMuteMode, onError: () => void) => {
    if (mutation.isPending) return;
    void queryClient.cancelQueries({ queryKey: ['chats'] }).then(() => {
      const update = (muteMode: ChatMuteMode) => queryClient.setQueryData<MutedChat[]>(['chats'], (current) =>
        current?.map((item) => item.id === chat.id ? { ...item, isMuted: muteMode !== 'unmuted', muteMode } : item));
      update(mode);
      mutation.mutate({ conversationId: chat.id, data: { muteMode: mode } }, {
        onSuccess: (result) => {
          update(result.muteMode);
          void queryClient.invalidateQueries({ queryKey: ['chats'] });
        },
        onError: () => {
          update(getChatMuteMode(chat));
          onError();
        },
      });
    });
  };

  return { setMuteMode, isPending: mutation.isPending };
}