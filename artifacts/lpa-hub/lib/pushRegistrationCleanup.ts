/** Remove both sides of a provider migration, even if sign-out interrupts it. */
export async function removeDevicePushRegistrations(
  candidate: { expoPushToken: string } | null,
  storedToken: Promise<string | null>,
  remove: (key: string) => Promise<unknown>,
) {
  const keys = new Set<string>();
  if (candidate?.expoPushToken) keys.add(candidate.expoPushToken);
  try {
    const stored = await storedToken;
    const parsed = stored ? JSON.parse(stored) : null;
    if ((parsed?.platform === 'ios' || parsed?.platform === 'android')
      && typeof parsed.expoPushToken === 'string' && parsed.expoPushToken) {
      keys.add(parsed.expoPushToken);
    }
  } catch {
    // Still remove the in-memory device if its cache is corrupt or unavailable.
  }
  const results = await Promise.allSettled([...keys].map(key => remove(key)));
  if (results.some(result => result.status === 'rejected')) {
    throw new Error('Some device notification registrations could not be removed.');
  }
}
