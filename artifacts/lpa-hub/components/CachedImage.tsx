import React from 'react';
import { Image as ExpoImage, type ImageProps } from 'expo-image';

// Each upload has a unique object path. Signed URL query parameters rotate even
// when the image has not changed, so use that path for the device cache key.
export function CachedImage({ source, cachePolicy = 'memory-disk', resizeMode, contentFit, ...props }: ImageProps) {
  const cachedSource = source && typeof source === 'object' && !Array.isArray(source)
    && 'uri' in source && typeof source.uri === 'string'
    && /[?&](?:X-Goog-|GoogleAccessId=|X-Amz-)/i.test(source.uri)
    ? { ...source, cacheKey: source.uri.split('?')[0] }
    : source;
  const fit = contentFit ?? (resizeMode === 'stretch' ? 'fill' : resizeMode === 'center' ? 'none' : resizeMode === 'repeat' ? 'cover' : resizeMode);
  return <ExpoImage {...props} source={cachedSource} cachePolicy={cachePolicy} contentFit={fit} />;
}