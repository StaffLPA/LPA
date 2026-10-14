export function safeFormPath(path: unknown): string | null {
  return typeof path === 'string' && /^\/forms(?:\/(?:settings|[0-9a-f-]{36}))?$/.test(path) ? path : null;
}
export function afterLoginDestination(returnTo: unknown) {
  return safeFormPath(returnTo) ?? (returnTo === '/admin-dashboard' ? '/admin-dashboard' : '/(tabs)');
}
