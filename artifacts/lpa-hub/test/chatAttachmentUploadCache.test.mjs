import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatAttachmentUploadCache } from "../lib/chatAttachmentUploadCache.ts";

test("concurrent sends and retries reuse a completed or in-flight upload", async () => {
  const cache = new ChatAttachmentUploadCache();
  const attachment = {};
  let calls = 0;
  let finish;
  const upload = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
  const first = cache.getOrUpload(attachment, "account:chat", upload);
  const second = cache.getOrUpload(attachment, "account:chat", upload);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish({ objectPath: "/objects/uploads/example" });
  await first;
  assert.equal(cache.getOrUpload(attachment, "account:chat", upload), first);
  assert.equal(calls, 1);
});

test("failed uploads can retry instead of retaining a rejected promise", async () => {
  const cache = new ChatAttachmentUploadCache();
  const attachment = {};
  await assert.rejects(cache.getOrUpload(attachment, "account:chat", async () => { throw new Error("offline"); }), /offline/);
  const retried = await cache.getOrUpload(attachment, "account:chat", async () => ({ objectPath: "/objects/uploads/retried" }));
  assert.equal(retried.objectPath, "/objects/uploads/retried");
});

test("upload paths are never reused in another chat or another account", async () => {
  const cache = new ChatAttachmentUploadCache();
  const attachment = {};
  let calls = 0;
  const upload = async () => ({ objectPath: `/objects/uploads/${++calls}` });
  await cache.getOrUpload(attachment, "account-one:chat-one", upload);
  await cache.getOrUpload(attachment, "account-one:chat-two", upload);
  await cache.getOrUpload(attachment, "account-two:chat-two", upload);
  assert.equal(calls, 3);
});

test("an old-scope failure cannot evict the current account's upload", async () => {
  const cache = new ChatAttachmentUploadCache();
  const attachment = {};
  let rejectOld;
  const old = cache.getOrUpload(attachment, "old:chat", () => new Promise((_, reject) => { rejectOld = reject; }));
  const current = cache.getOrUpload(attachment, "current:chat", async () => ({ objectPath: "/objects/uploads/current" }));
  await Promise.resolve();
  rejectOld(new Error("old failed"));
  await assert.rejects(old, /old failed/);
  await current;
  assert.equal(cache.getOrUpload(attachment, "current:chat", async () => { throw new Error("must reuse current upload"); }), current);
});

test("separately selected files get separate upload paths even with the same name", async () => {
  const cache = new ChatAttachmentUploadCache();
  let calls = 0;
  const upload = async () => ({ objectPath: `/objects/uploads/${++calls}` });
  const first = await cache.getOrUpload({ fileName: "image.jpg" }, "account:chat", upload);
  const second = await cache.getOrUpload({ fileName: "image.jpg" }, "account:chat", upload);
  assert.notEqual(first.objectPath, second.objectPath);
});
