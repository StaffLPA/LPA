export type ComposerKeyEvent = { key?: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

/** Web only: Enter sends, Shift+Enter inserts a newline, IME composition never sends. */
export function shouldSendOnWebKey(event: ComposerKeyEvent, platform: string) {
  if (platform !== 'web' || event.key !== 'Enter') return false;
  if (event.isComposing || event.keyCode === 229) return false;
  return !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

export const COMPOSER_MIN_HEIGHT = 42;
export const COMPOSER_MAX_HEIGHT = 180;
export const COMPOSER_LINE_HEIGHT = 18;
// 11 points above/below the text, plus the two 1-point borders.
export const COMPOSER_VERTICAL_INSET = 24;

export function composerHeight(contentHeight: number, verticalPadding = COMPOSER_VERTICAL_INSET) {
  const next = Math.ceil(contentHeight + verticalPadding);
  return Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, Number.isFinite(next) ? next : COMPOSER_MIN_HEIGHT));
}

/** Preserve the final empty line in the independent, unconstrained text layout. */
export function composerMeasurementText(text: string) {
  return `${text}\u200b`;
}

/** The independent text measurement includes soft wraps, but not input padding/borders. */
export function composerHeightForText(text: string, measuredHeight: number) {
  if (!text) return COMPOSER_MIN_HEIGHT;
  return composerHeight(measuredHeight);
}
