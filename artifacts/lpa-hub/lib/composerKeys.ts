export type ComposerKeyEvent = { key?: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

/** Web only: Enter sends, Shift+Enter inserts a newline, IME composition never sends. */
export function shouldSendOnWebKey(event: ComposerKeyEvent, platform: string) {
  if (platform !== 'web' || event.key !== 'Enter') return false;
  if (event.isComposing || event.keyCode === 229) return false;
  return !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

export const COMPOSER_MIN_HEIGHT = 42;
export const COMPOSER_MAX_HEIGHT = 180;

export function composerHeight(contentHeight: number, verticalPadding = 24) {
  const next = Math.ceil(contentHeight + verticalPadding);
  return Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, Number.isFinite(next) ? next : COMPOSER_MIN_HEIGHT));
}

/** Native content-size includes padding; explicit newlines must grow immediately too. */
export function composerHeightForText(text: string, measuredHeight: number) {
  if (!text) return COMPOSER_MIN_HEIGHT;
  return Math.max(
    composerHeight(measuredHeight, 0),
    composerHeight(text.split('\n').length * 18),
  );
}
