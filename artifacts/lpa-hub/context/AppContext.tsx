import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch, registerPushToken, removePushToken, setAuthTokenGetter, useGetSessionStatus } from '@workspace/api-client-react';
import { isAccountLockSessionError } from './session-lock-errors.mjs';
import { createSharedSyncCoordinator, startSharedSyncTriggers } from './live-sync-coordinator.mjs';
import { clearStoredSession, loadStoredSession, persistStoredSession } from './session-store.mjs';
import { requestMessagePushToken, setApplicationBadgeCount, type RegisteredPushToken } from '@/lib/messagePushNotifications';
import { hasOneSignalNativeModule, loginOneSignal, logoutOneSignal, pauseOneSignalPush, resumeOneSignalPush, requestOneSignalPermission, startOneSignal } from '@/lib/oneSignal';

export type Role = 'Admin' | 'Staff-Coach' | 'Parent-Athlete' | 'Athlete';
export type StoredUser = { id: string; fullName: string; firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; address?: string | null; birthday?: string | null; gender?: string | null; role: Role; status: string; teams: string[]; photoUri?: string | null; profilePhotoUri?: string | null; profilePhotoOriginalUri?: string | null; profilePhotoPath?: string | null };
export type Message = { id: string; sender: string; initials: string; text: string; time: string; unread?: number; color: string };
export type Submission = { id: string; type: string; date: string; status: 'Submitted' | 'Reviewing' };
// Focus and foreground events still refresh immediately; the timer is a
// fallback for active sessions and must remain gentle with many clients.
export const LIVE_DATA_REFRESH_MS = 30_000;
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
  const [pushPermissionEpoch, setPushPermissionEpoch] = useState(0);
  const [oneSignalSubscriptionId, setOneSignalSubscriptionId] = useState<string | null>(null);
  const [oneSignalReady, setOneSignalReady] = useState(() => !hasOneSignalNativeModule());
  const oneSignalDialogShown = useRef(false);
  const registeredPushKeyRef = useRef<string | null>(null);
  const registrationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const signingOutUserRef = useRef<string | null>(null);
  const candidatePushRef = useRef<{ userId: string; token: RegisteredPushToken } | null>(null);

  useEffect(() => {
    let active = true;
    const showDialog = () => {
      if (!active) return;
      Alert.alert(
        'Stay up to date with LPA',
        'Enable notifications to receive important LPA announcements and messages from your team.',
        [{
          text: 'Got it',
          onPress: () => {
            void AsyncStorage.setItem('lpa-onesignal-intro-shown', '1').catch((error: unknown) => {
              console.warn('Unable to store the OneSignal introduction state.', error);
            });
            void requestOneSignalPermission()
              .then(() => setPushPermissionEpoch((epoch) => epoch + 1))
              .catch((error: unknown) => console.warn('Unable to request OneSignal notification permission.', error));
          },
        }],
        { cancelable: false },
      );
    };
    const stop = startOneSignal((subscriptionId) => {
      if (!active) return;
      setOneSignalSubscriptionId(subscriptionId);
      setOneSignalReady(true);
      if (!subscriptionId || oneSignalDialogShown.current) return;
      oneSignalDialogShown.current = true;
      void AsyncStorage.getItem('lpa-onesignal-intro-shown').then((shown) => {
        if (shown || !active) return;
        showDialog();
      }).catch((error: unknown) => {
        console.warn('Unable to store the LPA notification introduction state.', error);
        showDialog();
      });
    });
    return () => { active = false; stop(); };
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => sessionToken);
    Promise.all([loadStoredSession(AsyncStorage), AsyncStorage.getItem('lpa-submissions')]).then(([storedSession, storedSubmissions]) => {
      if (storedSession) {
        sessionToken = storedSession.token;
        setUser(storedSession.user as StoredUser);
      }
      if (storedSubmissions) setSubmissions(JSON.parse(storedSubmissions) as Submission[]);
    }).catch(() => { sessionToken = null; }).finally(() => setIsReady(true));
  }, []);

  const role = user?.role ?? 'Parent-Athlete';
  const updateRole = (_next: Role) => {};
  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      logoutOneSignal();
      return;
    }
    loginOneSignal(user.id);
    // Only a successful registration for this account may resume a subscription
    // paused at sign-out. A failed DELETE must not expose the old account's pushes.
  }, [isReady, user?.id]);
  const signOut = useCallback(() => {
    const previousUserId = user?.id;
    const previousSessionToken = sessionToken;
    const currentCandidate = candidatePushRef.current;
    const previousCandidate = currentCandidate && currentCandidate.userId === previousUserId
      ? currentCandidate.token
      : pushToken;
    if (previousUserId) signingOutUserRef.current = previousUserId;
    pauseOneSignalPush();
    const cachedToken = previousUserId ? AsyncStorage.getItem(`lpa-push-token:${previousUserId}`) : Promise.resolve(null);
    // Complete any POST that has already begun, then remove its device using
    // the captured session, even though local sign-out happens immediately.
    const removal = registrationQueueRef.current.catch(() => undefined).then(async () => {
      if (!previousUserId || !previousSessionToken) return;
      let token = previousCandidate;
      if (!token) {
        try {
          const stored = await cachedToken;
          const parsed = stored ? JSON.parse(stored) as Partial<RegisteredPushToken> : null;
          if (parsed?.platform === 'ios' || parsed?.platform === 'android') {
            if (typeof parsed.expoPushToken === 'string') token = { platform: parsed.platform, expoPushToken: parsed.expoPushToken };
          }
        } catch {
          // No cached token to remove; the next login will register the device again.
        }
      }
      if (token) await removePushToken(
        { expoPushToken: token.expoPushToken },
        { suppressUnauthorizedHandler: true, headers: { Authorization: `Bearer ${previousSessionToken}` } },
      );
    });
    registrationQueueRef.current = removal.catch(() => undefined);
    void removal.catch((error: unknown) => console.warn('Unable to remove this device from LPA notifications during sign-out.', error))
      .finally(() => {
        if (signingOutUserRef.current === previousUserId) {
          signingOutUserRef.current = null;
          // A quick sign-in to this same account may have skipped registration
          // while its previous device removal was still in progress.
          setPushPermissionEpoch((epoch) => epoch + 1);
        }
      });
    sessionToken = null;
    setUser(null);
    setIsSyncing(false);
    setLastSyncedAt(null);
    setSyncError(null);
    setPushToken(null);
    registeredPushKeyRef.current = null;
    queryClient.clear();
    // Remove private images from the device when this account signs out.
    void Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]).catch(() => undefined);
    void clearStoredSession(AsyncStorage, user?.id);
    void setApplicationBadgeCount(0).catch(() => undefined);
  }, [pushToken, queryClient, user]);
  const completeAuthentication = useCallback(async (nextUser: StoredUser, token: string) => {
    sessionToken = token;
    queryClient.clear();
    setUser(nextUser);
    await persistStoredSession(AsyncStorage, nextUser, token);
  }, [queryClient]);
  const updateUser = useCallback((nextUser: StoredUser) => {
    setUser(nextUser);
    void AsyncStorage.setItem('lpa-active-user', JSON.stringify(nextUser));
  }, []);
  // A small authenticated check signs out idle screens too. Ordinary offline
  // failures still keep cached content; only an explicit lock/revocation clears it.
  const sessionStatus = useGetSessionStatus({
    query: {
      queryKey: ['/api/auth/session-status', user?.id],
      enabled: Boolean(isReady && user && sessionToken),
      refetchInterval: 2_000,
      refetchIntervalInBackground: false,
      retry: false,
    },
  });
  useEffect(() => {
    if (user && isAccountLockSessionError(sessionStatus.error)) signOut();
  }, [user, sessionStatus.error, signOut]);
  const syncSharedData = useMemo(() => {
    const capturedToken = sessionToken;
    return createSharedSyncCoordinator({
    hasSession: () => Boolean(user && capturedToken && sessionToken === capturedToken),
    refreshProfile: () => customFetch<StoredUser>('/api/auth/me', { responseType: 'json' }),
    refetchActiveQueries: () => queryClient.refetchQueries({ type: 'active', stale: true }),
    onProfile: (freshUser: StoredUser) => {
      if (JSON.stringify(freshUser) !== JSON.stringify(user)) updateUser(freshUser);
    },
    onStateChange: (state: { isSyncing?: boolean; syncError?: string | null; lastSyncedAt?: Date }) => {
      if (sessionToken !== capturedToken) return;
      if (state.isSyncing !== undefined) setIsSyncing(state.isSyncing);
      if (state.syncError !== undefined) setSyncError(state.syncError);
      if (state.lastSyncedAt !== undefined) setLastSyncedAt(state.lastSyncedAt);
    },
    });
  }, [queryClient, updateUser, user]);
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
    if (!user || !sessionToken || !oneSignalReady) return;
    let cancelled = false;
    const registerDevice = async () => {
      if (cancelled || !sessionToken || signingOutUserRef.current === user.id) return;
      try {
        const oneSignalNative = Platform.OS === 'ios' && hasOneSignalNativeModule();
        const subscriptionId = oneSignalNative ? oneSignalSubscriptionId : undefined;
        let token = await requestMessagePushToken();
        // Permission can be revoked after the Expo token has been registered.
        // Use that same stored device token to clear an expired OneSignal mapping.
        if (!token && oneSignalNative && subscriptionId === null) {
          const storedToken = await AsyncStorage.getItem(`lpa-push-token:${user.id}`);
          if (storedToken) {
            try {
              const parsed = JSON.parse(storedToken) as Partial<RegisteredPushToken>;
              if (typeof parsed.expoPushToken === 'string' && parsed.expoPushToken
                && (parsed.platform === 'ios' || parsed.platform === 'android')) {
                token = { expoPushToken: parsed.expoPushToken, platform: parsed.platform };
              }
            } catch {
              // Invalid cached token data is ignored; a new token can be requested after permission is restored.
            }
          }
        }
        if (!token || cancelled || signingOutUserRef.current === user.id) return;
        candidatePushRef.current = { userId: user.id, token };
        const registrationKey = JSON.stringify([user.id, token.expoPushToken, subscriptionId ?? null]);
        const operation = registrationQueueRef.current.catch(() => undefined).then(async () => {
          if (cancelled || !sessionToken || signingOutUserRef.current === user.id) return;
          if (registeredPushKeyRef.current === registrationKey) {
            setPushToken(token);
            return;
          }
          const registration = subscriptionId === undefined
            ? token
            : { ...token, oneSignalSubscriptionId: subscriptionId };
          await registerPushToken(registration, { suppressUnauthorizedHandler: true });
          if (cancelled) return;
          registeredPushKeyRef.current = registrationKey;
          setPushToken(token);
          if (subscriptionId && signingOutUserRef.current !== user.id) resumeOneSignalPush();
          await AsyncStorage.setItem(`lpa-push-token:${user.id}`, JSON.stringify(token));
        });
        registrationQueueRef.current = operation.then(() => undefined, () => undefined);
        await operation;
      } catch (error) {
        console.warn('Unable to register this device for LPA notifications.', error);
      }
    };
    void registerDevice();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void registerDevice();
    });
    return () => {
      cancelled = true;
      appStateSubscription.remove();
    };
  }, [oneSignalReady, oneSignalSubscriptionId, pushPermissionEpoch, user?.id]);

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