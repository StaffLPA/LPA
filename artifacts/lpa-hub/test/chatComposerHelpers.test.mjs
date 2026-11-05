import test from 'node:test';
import assert from 'node:assert/strict';
import { chatDraftKey, conversationIdFromDraftKey, parseDraft, serializeDraft } from '../lib/chatDraft.ts';
import { shouldSendOnWebKey, composerHeight, composerHeightForText, COMPOSER_MIN_HEIGHT, COMPOSER_MAX_HEIGHT } from '../lib/composerKeys.ts';
import { groupPhotoErrorMessage, prepareGroupChatPhoto } from '../lib/groupChatPhotoUpload.ts';
import { canSendChatAttachments, canUseEveryoneMention, canChangeGroupPhoto } from '../lib/chatCapabilities.ts';
import { mergeNativePick, localPartsToDate, scheduleProblem, toUtcIso } from '../lib/announcementSchedule.ts';

test('draft keys separate accounts and conversations', () => {
  assert.notEqual(chatDraftKey('user-a', 'c1'), chatDraftKey('user-b', 'c1'));
  assert.equal(conversationIdFromDraftKey('user-a', chatDraftKey('user-a', 'c:1')), 'c:1');
  assert.equal(conversationIdFromDraftKey('user-b', chatDraftKey('user-a', 'c1')), null);
});

test('drafts keep valid mentions and drop empty text', () => {
  const raw = serializeDraft('Hi @everyone and @Jo', [{ userId: 'everyone', displayName: 'everyone', start: 3, end: 12 }, { userId: 'x', displayName: 'Bad', start: 0, end: 4 }]);
  const parsed = parseDraft(raw);
  assert.equal(parsed.text, 'Hi @everyone and @Jo');
  assert.deepEqual(parsed.mentions.map((m) => m.userId), ['everyone']);
  assert.equal(serializeDraft('   \n ', []), null);
  assert.equal(parseDraft('not json'), null);
});

test('web Enter sends, Shift+Enter and IME do not, native never sends', () => {
  assert.equal(shouldSendOnWebKey({ key: 'Enter' }, 'web'), true);
  assert.equal(shouldSendOnWebKey({ key: 'Enter', shiftKey: true }, 'web'), false);
  assert.equal(shouldSendOnWebKey({ key: 'Enter', isComposing: true }, 'web'), false);
  assert.equal(shouldSendOnWebKey({ key: 'Enter', keyCode: 229 }, 'web'), false);
  assert.equal(shouldSendOnWebKey({ key: 'Enter' }, 'ios'), false);
  assert.equal(composerHeight(5000), COMPOSER_MAX_HEIGHT);
  assert.equal(composerHeight(0), 42);
});

test('every member can attach and mention everyone; only staff can change the group photo', () => {
  const group = { type: 'group', photoPermission: 'staff' };
  assert.equal(canSendChatAttachments(group, 'Athlete'), true);
  assert.equal(canSendChatAttachments(group, 'Parent-Athlete'), true);
  assert.equal(canSendChatAttachments(group, 'Staff-Coach'), true);
  assert.equal(canSendChatAttachments({ type: 'direct', photoPermission: 'staff' }, 'Athlete'), true);
  assert.equal(canChangeGroupPhoto(group, 'Admin'), true);
  assert.equal(canChangeGroupPhoto(group, 'Staff-Coach'), true);
  assert.equal(canChangeGroupPhoto(group, 'Athlete'), false);
  assert.equal(canChangeGroupPhoto(group, 'Parent-Athlete'), false);
  assert.equal(canUseEveryoneMention({ type: 'group' }, 'Admin'), true);
  assert.equal(canUseEveryoneMention({ type: 'group', canMentionEveryone: false }, 'Athlete'), true);
  assert.equal(canUseEveryoneMention({ type: 'group' }, 'Parent-Athlete'), true);
  assert.equal(canUseEveryoneMention({ type: 'group', canMentionEveryone: true }, 'Athlete'), true);
  assert.equal(canUseEveryoneMention({ type: 'direct', canMentionEveryone: true }, 'Admin'), false);
});

test('group photos upload native Blobs without unsupported arrayBuffer conversion', async () => {
  const nativeBlob = Object.freeze({ size: 2048, type: 'image/jpeg' });
  assert.equal(nativeBlob.arrayBuffer, undefined);
  const photo = await prepareGroupChatPhoto({ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' },
    async (uri) => {
      assert.equal(uri, 'file:///photo.jpg');
      return { ok: true, blob: async () => nativeBlob };
    });
  assert.equal(photo.body, nativeBlob);
  assert.equal(photo.contentType, 'image/jpeg');
  const webFile = new Blob(['image bytes'], { type: 'image/png' });
  const webPhoto = await prepareGroupChatPhoto({ uri: 'blob:web-image', file: webFile },
    async () => { throw new Error('Web files must not be fetched again'); });
  assert.equal(webPhoto.body, webFile);
  assert.equal(webPhoto.contentType, 'image/png');
});

test('group photo validation uses actual upload size and reports unreadable or unsupported files', async () => {
  for (const [blob, expected] of [
    [{ size: 0, type: 'image/jpeg' }, /empty/],
    [{ size: 10 * 1024 * 1024 + 1, type: 'image/jpeg' }, /10 MB/],
    [{ size: 100, type: 'application/pdf' }, /image file/],
  ]) {
    await assert.rejects(prepareGroupChatPhoto({ uri: 'file:///photo' },
      async () => ({ blob: async () => blob })), expected);
  }
  await assert.rejects(prepareGroupChatPhoto({ uri: 'file:///missing' },
    async () => ({ ok: false, blob: async () => { throw new Error('not called'); } })), /read that photo/);
});

test('group photos accept modern image formats and prefer file metadata over stale picker labels', async () => {
  const file = new Blob(['image bytes'], { type: 'image/png' });
  const photo = await prepareGroupChatPhoto({ uri: 'blob:cropped', mimeType: 'image/jpeg', file });
  assert.equal(photo.body, file);
  assert.equal(photo.contentType, 'image/png');
  const heic = await prepareGroupChatPhoto({ uri: 'file:///photo.heic', mimeType: 'image/heic' },
    async () => ({ blob: async () => ({ size: 30, type: 'image/heic' }) }));
  assert.equal(heic.contentType, 'image/heic');
  const tiff = await prepareGroupChatPhoto({ uri: 'file:///photo.tiff', mimeType: 'image/tiff' },
    async () => ({ blob: async () => ({ size: 30, type: 'image/tiff' }) }));
  assert.equal(tiff.contentType, 'image/tiff');
  const avif = await prepareGroupChatPhoto({ uri: 'file:///photo.avif', mimeType: 'image/avif' },
    async () => ({ blob: async () => ({ size: 30, type: 'image/avif' }) }));
  assert.equal(avif.contentType, 'image/avif');
  const nativePhoto = await prepareGroupChatPhoto(
    { uri: 'file:///photo.jpg', mimeType: 'image/jpeg' },
    async () => ({ blob: async () => ({ size: 30, type: 'application/octet-stream' }) }),
  );
  assert.equal(nativePhoto.contentType, 'image/jpeg');
});

test('group photo failures show safe API messages instead of hiding every server error', () => {
  const fallback = 'Could not update the group photo. Please try again.';
  assert.equal(groupPhotoErrorMessage({ status: 400, data: { message: 'That image format could not be read.' } }, fallback), 'That image format could not be read.');
  assert.equal(groupPhotoErrorMessage({ status: 503, data: { message: 'The photo could not be saved right now. Please try again.' } }, fallback), 'The photo could not be saved right now. Please try again.');
  assert.match(groupPhotoErrorMessage({ status: 403 }, fallback), /admins and coaches/);
  assert.match(groupPhotoErrorMessage({ status: 413 }, fallback), /10 MB/);
  assert.equal(groupPhotoErrorMessage({ status: 502, data: { message: '<html>Proxy error</html>' } }, fallback), fallback);
  assert.equal(groupPhotoErrorMessage(new Error('Internal detail'), fallback), fallback);
});

test('composer grows for newlines and native wrapped text, caps for scrolling, and resets after sending', () => {
  assert.equal(composerHeightForText('hello', 42), 42);
  assert.equal(composerHeightForText('hello\n', 42), 60);
  assert.equal(composerHeightForText('hello\n\n', 42), 78);
  assert.equal(composerHeightForText('wrapped text', 114), 114, 'native padding is not added a second time');
  assert.equal(composerHeightForText('\n'.repeat(30), 42), COMPOSER_MAX_HEIGHT);
  assert.equal(composerHeightForText('long wrapped text', 500), COMPOSER_MAX_HEIGHT);
  assert.equal(composerHeightForText('', COMPOSER_MAX_HEIGHT), COMPOSER_MIN_HEIGHT);
});

test('schedule parsing validates and serializes to UTC', () => {
  assert.equal(localPartsToDate('2026-02-30', '09:00'), null);
  const date = localPartsToDate('2030-11-10', '09:00');
  assert.equal(scheduleProblem(date, new Date('2026-01-01T00:00:00Z')), null);
  assert.match(scheduleProblem(new Date(0)), /future/);
  assert.match(toUtcIso(date), /Z$/);
});

test('native picker merges only the chosen half', () => {
  const current = new Date(2030, 0, 5, 9, 30);
  const d = mergeNativePick(current, new Date(2030, 5, 12, 23, 59), 'date');
  assert.deepEqual([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [5, 12, 9, 30]);
  const t = mergeNativePick(current, new Date(1999, 1, 1, 14, 5), 'time');
  assert.deepEqual([t.getFullYear(), t.getDate(), t.getHours(), t.getMinutes()], [2030, 5, 14, 5]);
});

test('@everyone alerts: dismissal is per mention, active chat suppressed', async () => {
  const { pendingEveryoneAlerts, addDismissed, activeChatIdFromPath } = await import('../lib/everyoneMentionAlerts.ts');
  const chats = [
    { id: 'g1', name: 'Varsity', unreadEveryoneMentionId: 'm1', lastMessage: { createdAt: '2026-01-01T00:00:00Z' } },
    { id: 'g2', name: 'Coaches', muteMode: 'all', unreadEveryoneMentionId: 'm2', lastMessage: { createdAt: '2026-01-02T00:00:00Z' } },
    { id: 'g3', name: 'Mentions', isMuted: true, muteMode: 'mentions', unreadEveryoneMentionId: 'm3', lastMessage: { createdAt: '2026-01-03T00:00:00Z' } },
    { id: 'g4', name: 'Quiet', unreadEveryoneMentionId: null },
  ];
  assert.deepEqual(pendingEveryoneAlerts(chats, new Set()).map((a) => a.mentionId), ['m3', 'm1']);
  assert.deepEqual(pendingEveryoneAlerts(chats, new Set(['m3']), 'g1'), []);
  const later = [{ ...chats[0], unreadEveryoneMentionId: 'm3' }];
  assert.equal(pendingEveryoneAlerts(later, new Set(['m1']))[0].mentionId, 'm3');
  assert.deepEqual(addDismissed(['a', 'b'], 'a'), ['b', 'a']);
  assert.equal(activeChatIdFromPath('/chat/g%201'), 'g 1');
  assert.equal(activeChatIdFromPath('/messages'), null);
});
