const MAX_BYTES = 10 * 1024 * 1024;

export class GroupPhotoUploadError extends Error {}

export function groupPhotoErrorMessage(error: unknown, fallback: string) {
  if (error instanceof GroupPhotoUploadError) return error.message;
  if (typeof error !== 'object' || error === null) return fallback;
  const status = 'status' in error ? Number(error.status) : 0;
  if (status === 403) return 'Only admins and coaches can change the group photo.';
  if (status === 413) return 'Photos must be 10 MB or smaller.';
  const data = 'data' in error ? error.data : null;
  const message = typeof data === 'object' && data !== null && 'message' in data ? data.message : null;
  return typeof message === 'string' && message.trim() && message.length <= 240 && !/[<>]/.test(message)
    ? message : fallback;
}

/** Keep the Blob intact: React Native Blobs do not implement arrayBuffer(). */
export async function prepareGroupChatPhoto(
  asset: { uri: string; mimeType?: string | null; file?: Blob },
  fetchAsset: (uri: string) => Promise<{ ok?: boolean; blob(): Promise<Blob> }> = fetch,
) {
  let body = asset.file;
  if (!body) {
    const response = await fetchAsset(asset.uri);
    if (response.ok === false) throw new GroupPhotoUploadError('Could not read that photo. Please choose it again.');
    body = await response.blob();
  }
  const normalize = (type?: string | null) => (type || '').split(';')[0].trim().toLowerCase();
  const blobType = normalize(body.type);
  const assetType = normalize(asset.mimeType);
  const declaredType = blobType || assetType;
  if (declaredType && !declaredType.startsWith('image/') && declaredType !== 'application/octet-stream') {
    throw new GroupPhotoUploadError('Choose an image file.');
  }
  const contentType = blobType.startsWith('image/') ? blobType
    : assetType.startsWith('image/') ? assetType : 'image/jpeg';
  if (!body.size) throw new GroupPhotoUploadError('That photo is empty. Please choose another image.');
  if (body.size > MAX_BYTES) throw new GroupPhotoUploadError('Photos must be 10 MB or smaller.');
  return { body, contentType };
}
