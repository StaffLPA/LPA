export type PhotoSize = { width: number; height: number };

/** Fit the entire decoded image, never crop, distort, or enlarge a thumbnail. */
export function fitChatPhoto(source: PhotoSize, bounds: PhotoSize, allowUpscale = false): PhotoSize | null {
  if (![source.width, source.height, bounds.width, bounds.height].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.min(bounds.width / source.width, bounds.height / source.height, allowUpscale ? Infinity : 1);
  return { width: source.width * scale, height: source.height * scale };
}

/** Compact limits, not a fixed image size: preserve the entire image's ratio. */
export function chatPhotoBounds(windowWidth: number): PhotoSize {
  return { width: Math.min(220, Math.max(1, (windowWidth - 32) * 0.92 - 37 - 22)), height: 180 };
}

/** Long screenshots need more than 4x to make their text readable. */
export function photoMaximumScale(image: PhotoSize, viewport: PhotoSize) {
  const fit = fitChatPhoto(image, viewport, true);
  return fit ? Math.min(32, Math.max(4, image.width / fit.width)) : 4;
}

export function constrainPhotoPan(pan: { x: number; y: number }, image: PhotoSize, viewport: PhotoSize, scale: number) {
  const fit = fitChatPhoto(image, viewport, true);
  const maxX = fit ? Math.max(0, (fit.width * scale - viewport.width) / 2) : 0;
  const maxY = fit ? Math.max(0, (fit.height * scale - viewport.height) / 2) : 0;
  return {
    x: maxX ? Math.max(-maxX, Math.min(maxX, pan.x)) : 0,
    y: maxY ? Math.max(-maxY, Math.min(maxY, pan.y)) : 0,
  };
}
