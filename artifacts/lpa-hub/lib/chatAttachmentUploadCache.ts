type UploadedAttachment = { objectPath: string };

/** Reuse successful and in-flight uploads, but never across accounts or chats. */
export class ChatAttachmentUploadCache {
  private uploads = new WeakMap<object, { scope: string; promise: Promise<UploadedAttachment> }>();

  getOrUpload(attachment: object, scope: string, upload: () => Promise<UploadedAttachment>) {
    const cached = this.uploads.get(attachment);
    if (cached?.scope === scope) return cached.promise;
    const entry = { scope, promise: Promise.resolve().then(upload) };
    this.uploads.set(attachment, entry);
    void entry.promise.catch(() => {
      if (this.uploads.get(attachment) === entry) this.uploads.delete(attachment);
    });
    return entry.promise;
  }
}
