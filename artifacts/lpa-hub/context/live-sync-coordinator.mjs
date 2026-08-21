export function createSharedSyncCoordinator({
  hasSession,
  refreshProfile,
  refetchActiveQueries,
  onProfile,
  onStateChange,
  now = () => new Date(),
}) {
  let inFlight = false;

  return async function syncSharedData() {
    if (!hasSession() || inFlight) return;

    inFlight = true;
    onStateChange({ isSyncing: true, syncError: null });
    try {
      const [freshUser] = await Promise.all([refreshProfile(), refetchActiveQueries()]);
      onProfile(freshUser);
      onStateChange({ lastSyncedAt: now() });
    } catch {
      onStateChange({ syncError: 'Live data could not refresh. Tap to retry.' });
    } finally {
      inFlight = false;
      onStateChange({ isSyncing: false });
    }
  };
}

export function startSharedSyncTriggers({
  sync,
  appState,
  platform,
  windowRef,
  documentRef,
  intervalMs,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
}) {
  void sync();
  const interval = setIntervalFn(() => void sync(), intervalMs);
  const appStateSubscription = appState.addEventListener('change', (state) => {
    if (state === 'active') void sync();
  });
  const refreshOnVisible = () => {
    if (!documentRef || documentRef.visibilityState === 'visible') void sync();
  };

  if (platform === 'web' && windowRef) {
    windowRef.addEventListener('focus', refreshOnVisible);
    documentRef?.addEventListener('visibilitychange', refreshOnVisible);
  }

  return () => {
    clearIntervalFn(interval);
    appStateSubscription.remove();
    if (platform === 'web' && windowRef) {
      windowRef.removeEventListener('focus', refreshOnVisible);
      documentRef?.removeEventListener('visibilitychange', refreshOnVisible);
    }
  };
}