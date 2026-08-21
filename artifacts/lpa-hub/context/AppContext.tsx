import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch, registerPushToken, removePushToken, setAuthTokenGetter, setUnauthorizedHandler } from '@workspace/api-client-react';
import { createSharedSyncCoordinator, startSharedSyncTriggers } from './live-sync-coordinator.mjs';
import { requestMessagePushToken, type RegisteredPushToken } from '@/lib/messagePushNotifications';

export type Role = 'Admin' | 'Staff-Coach' | 'Parent-Athlete' | 'Athlete';
export type StoredUser = { id: string; fullName: string; firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; address?: string | null; birthday?: string | null; gender?: string | null; role: Role; status: string; teams: string[]; photoUri?: string | null; profilePhotoUri?: string | null };
export type Message = { id: string; sender: string; initials: string; text: string; time: string; unread?: number; color: string };
export type Submission = { id: string; type: string; date: string; status: 'Submitted' | 'Reviewing' };
export const LIVE_DATA_REFRESH_MS = Platform.OS === 'android' ? 15_000 : 5_000;
let sessionToken: string | null = null;

type AppContextValue = {
  role: Role;
  setRole: (role: Role) => void;
  user: StoredUser | null;
  isReady: boolean;
  signOut: () => void;
  completeAuthentication: (user: StoredUser, token: string) => Promise<void>;
  updateUser: (user: StoredUser) => void;
  syncSharedData: () => Promise<void>;
  submissions: Submission[];
  addSubmission: (type: string) => void;
};

type LiveSyncContextValue = {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
  syncSharedData: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
const LiveSyncContext = createContext<LiveSyncContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<RegisteredPushToken | null>(null);

  useEffect(() => {
    setAuthTokenGetter(() => sessionToken);
    AsyncStorage.multiGet(['lpa-active-user', 'lpa-session-token', 'lpa-submissions']).then((items) => {
      const stored = Object.fromEntries(items);
      if (stored['lpa-session-token'] && stored['lpa-active-user']) {
        sessionToken = stored['lpa-session-token'];
        setUser(JSON.parse(stored['lpa-active-user']) as StoredUser);
      }
      items.forEach(([key, value]) => {
        if (!value) return;
        if (key === 'lpa-submissions') setSubmissions(JSON.parse(value) as Submission[]);
      });
    }).catch(() => { sessionToken = null; }).finally(() => setIsReady(true));
  }, []);

  const role = user?.role ?? 'Parent-Athlete';
  const updateRole = (_next: Role) => {};
  const signOut = useCallback(() => {
    if (pushToken) {
      void removePushToken({ expoPushToken: pushToken.expoPushToken }, { suppressUnauthorizedHandler: true }).catch(() => undefined);
    }
    sessionToken = null;
    setUser(null);
    setLastSyncedAt(null);
    setSyncError(null);
    setPushToken(null);
    queryClient.clear();
    void AsyncStorage.multiRemove(['lpa-active-user', 'lpa-session-token', user ? `lpa-push-token:${user.id}` : 'lpa-push-token']);
  }, [pushToken, queryClient, user]);
  const completeAuthentication = useCallback(async (nextUser: StoredUser, token: string) => {
    sessionToken = token;
    queryClient.clear();
    setUser(nextUser);
    await AsyncStorage.multiSet([['lpa-session-token', token], ['lpa-active-user', JSON.stringify(nextUser)]]);
  }, [queryClient]);
  const updateUser = useCallback((nextUser: StoredUser) => {
    setUser(nextUser);
    void AsyncStorage.setItem('lpa-active-user', JSON.stringify(nextUser));
  }, []);
  const syncSharedData = useMemo(() => createSharedSyncCoordinator({
    hasSession: () => Boolean(user && sessionToken),
    refreshProfile: () => customFetch<StoredUser>('/api/auth/me', { responseType: 'json' }),
    refetchActiveQueries: () => queryClient.refetchQueries({ type: 'active', stale: true }),
    onProfile: (freshUser: StoredUser) => {
      if (JSON.stringify(freshUser) !== JSON.stringify(user)) updateUser(freshUser);
    },
    onStateChange: (state: { isSyncing?: boolean; syncError?: string | null; lastSyncedAt?: Date }) => {
      if (state.isSyncing !== undefined) setIsSyncing(state.isSyncing);
      if (state.syncError !== undefined) setSyncError(state.syncError);
      if (state.lastSyncedAt !== undefined) setLastSyncedAt(state.lastSyncedAt);
    },
  }), [queryClient, updateUser, user]);
  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);
  useEffect(() => {
    if (!user || !sessionToken) return;

    return startSharedSyncTriggers({
      sync: syncSharedData,
      appState: AppState,
      platform: Platform.OS,
      windowRef: typeof window === 'undefined' ? undefined : window,
      documentRef: typeof document === 'undefined' ? undefined : document,
      intervalMs: LIVE_DATA_REFRESH_MS,
    });
  }, [syncSharedData, user]);
  useEffect(() => {
    if (!user || !sessionToken) return;
    let cancelled = false;
    void requestMessagePushToken().then(async (token) => {
      if (!token || cancelled) return;
      await registerPushToken(token, { suppressUnauthorizedHandler: true });
      if (cancelled) return;
      setPushToken(token);
      await AsyncStorage.setItem(`lpa-push-token:${user.id}`, JSON.stringify(token));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [user]);

  const addSubmission = (type: string) => {
    const next = [{ id: Date.now().toString(), type, date: 'Just now', status: 'Submitted' as const }, ...submissions];
    setSubmissions(next);
    void AsyncStorage.setItem('lpa-submissions', JSON.stringify(next));
  };

  const value = useMemo(() => ({ role, setRole: updateRole, user, isReady, signOut, completeAuthentication, updateUser, syncSharedData, submissions, addSubmission }), [role, user, isReady, signOut, completeAuthentication, updateUser, syncSharedData, submissions]);
  const liveSyncValue = useMemo(() => ({ isSyncing, lastSyncedAt, syncError, syncSharedData }), [isSyncing, lastSyncedAt, syncError, syncSharedData]);
  return <AppContext.Provider value={value}><LiveSyncContext.Provider value={liveSyncValue}>{children}</LiveSyncContext.Provider></AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export function useLiveSync() {
  const value = useContext(LiveSyncContext);
  if (!value) throw new Error('useLiveSync must be used inside AppProvider');
  return value;
}