import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';

type MetricsAgentContextValue = {
  activeConversationId: string | null;
  conversationStateReady: boolean;
  setActiveConversationId: (conversationId: string | null) => void;
};

const MetricsAgentContext = createContext<MetricsAgentContextValue | null>(null);
const storageKey = (userId: string) => `lpa-metrics-agent-active-conversation:${userId}`;

export function MetricsAgentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  const userId = user?.id ?? null;
  const requestRef = useRef(0);
  const [activeState, setActiveState] = useState<{
    owner: string | null;
    conversationId: string | null;
    ready: boolean;
  }>({ owner: null, conversationId: null, ready: false });

  useEffect(() => {
    const request = ++requestRef.current;
    if (!userId) {
      setActiveState({ owner: null, conversationId: null, ready: true });
      return;
    }
    setActiveState({ owner: userId, conversationId: null, ready: false });
    void AsyncStorage.getItem(storageKey(userId)).then((conversationId) => {
      if (requestRef.current === request) setActiveState({ owner: userId, conversationId, ready: true });
    }).catch(() => {
      if (requestRef.current === request) setActiveState({ owner: userId, conversationId: null, ready: true });
    });
    return () => { requestRef.current += 1; };
  }, [userId]);

  const setActiveConversationId = useCallback((conversationId: string | null) => {
    if (!userId) return;
    requestRef.current += 1;
    setActiveState({ owner: userId, conversationId, ready: true });
    const key = storageKey(userId);
    const operation = conversationId
      ? AsyncStorage.setItem(key, conversationId)
      : AsyncStorage.removeItem(key);
    void operation.catch(() => undefined);
  }, [userId]);

  const value = useMemo(() => ({
    activeConversationId: activeState.owner === userId ? activeState.conversationId : null,
    conversationStateReady: activeState.owner === userId && activeState.ready,
    setActiveConversationId,
  }), [activeState, setActiveConversationId, userId]);

  return <MetricsAgentContext.Provider value={value}>{children}</MetricsAgentContext.Provider>;
}

export function useMetricsAgentContext() {
  const value = useContext(MetricsAgentContext);
  if (!value) throw new Error('useMetricsAgentContext must be used inside MetricsAgentProvider');
  return value;
}
