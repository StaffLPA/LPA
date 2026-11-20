import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chatDraftKey, conversationIdFromDraftKey, parseDraft, serializeDraft } from '../lib/chatDraft.ts';
import { shouldSendOnWebKey, composerHeight, composerHeightForText, composerMeasurementText, COMPOSER_LINE_HEIGHT, COMPOSER_MIN_HEIGHT, COMPOSER_MAX_HEIGHT } from '../lib/composerKeys.ts';
import { groupPhotoErrorMessage, prepareGroupChatPhoto } from '../lib/groupChatPhotoUpload.ts';
import { canSendChatAttachments, canUseEveryoneMention, canChangeGroupPhoto } from '../lib/chatCapabilities.ts';
import { mergeNativePick, localPartsToDate, scheduleProblem, toUtcIso } from '../lib/announcementSchedule.ts';
import { chatPhotoBounds, fitChatPhoto, constrainPhotoPan, photoMaximumScale } from '../lib/chatPhotoLayout.ts';

test('chat photos fit portrait, landscape, square, and long screenshots without cropping or stretching', () => {
  const bounds = chatPhotoBounds(402);
  for (const source of [
    { width: 1000, height: 2000 }, { width: 2000, height: 1000 },
    { width: 1000, height: 1000 }, { width: 1080, height: 12000 },
    { width: 4000, height: 100 }, { width: 40, height: 50 },
  ]) {
    const result = fitChatPhoto(source, bounds);
    assert.ok(result.width <= bounds.width && result.height <= bounds.height);
    assert.ok(result.width <= source.width && result.height <= source.height, 'preview never upscales');
    assert.ok(Math.abs(result.width / result.height - source.width / source.height) < 1e-10);
    assert.ok(Math.min(result.width / bounds.width, result.height / bounds.height) <= 1);
  }
  assert.deepEqual(fitChatPhoto({ width: 1000, height: 2000 }, bounds), { width: 90, height: 180 });
  assert.deepEqual(fitChatPhoto({ width: 2000, height: 1000 }, bounds), { width: 220, height: 110 });
});

test('chat photo limits adapt to narrow screens and rotation', () => {
  assert.ok(chatPhotoBounds(320).width < 220);
  assert.ok(chatPhotoBounds(402).width > chatPhotoBounds(320).width);
  assert.equal(chatPhotoBounds(1024).width, 220);
  for (const width of [240, 320, 375, 402, 768]) {
    const bounds = chatPhotoBounds(width);
    assert.ok(bounds.width <= (width - 32) * 0.92 - 59);
    assert.equal(bounds.height, 180);
  }
});

test('ordinary camera photos and posters remain whole in a compact messaging preview', () => {
  const bounds = chatPhotoBounds(393);
  assert.deepEqual(fitChatPhoto({ width: 4032, height: 3024 }, bounds), { width: 220, height: 165 });
  assert.deepEqual(fitChatPhoto({ width: 3024, height: 4032 }, bounds), { width: 135, height: 180 });
  assert.deepEqual(fitChatPhoto({ width: 3000, height: 3000 }, bounds), { width: 180, height: 180 });
  assert.deepEqual(fitChatPhoto({ width: 1080, height: 12000 }, bounds), { width: 16.2, height: 180 });
  const preview = readFileSync(new URL('../components/ChatImagePreview.tsx', import.meta.url), 'utf8');
  assert.match(preview, /resizeMode="contain"/);
  assert.match(preview, /size \?\? styles\.loadingSize/);
  assert.doesNotMatch(preview, /resizeMode="cover"/);
});

test('invalid image metadata is rejected instead of inventing an aspect ratio', () => {
  for (const source of [{ width: 0, height: 200 }, { width: 100, height: -1 }, { width: NaN, height: 2 }, { width: 10, height: Infinity }]) {
    assert.equal(fitChatPhoto(source, { width: 240, height: 280 }), null);
  }
});

test('full-screen panning reaches zoomed image edges and resets at fit size', () => {
  const image = { width: 1000, height: 2000 };
  const viewport = { width: 400, height: 600 };
  assert.deepEqual(constrainPhotoPan({ x: 999, y: -999 }, image, viewport, 1), { x: 0, y: 0 });
  assert.deepEqual(constrainPhotoPan({ x: 999, y: -999 }, image, viewport, 2), { x: 100, y: -300 });
  assert.deepEqual(constrainPhotoPan({ x: -50, y: 80 }, image, viewport, 2), { x: -50, y: 80 });
  assert.deepEqual(constrainPhotoPan({ x: 999, y: 999 }, { width: 2000, height: 1000 }, viewport, 2), { x: 200, y: 0 });
  assert.deepEqual(constrainPhotoPan({ x: 50, y: 50 }, { width: 0, height: 0 }, viewport, 2), { x: 0, y: 0 });
  assert.equal(photoMaximumScale({ width: 1080, height: 12000 }, viewport), 20);
  assert.equal(photoMaximumScale({ width: 1080, height: 120000 }, viewport), 32);
  assert.equal(photoMaximumScale({ width: 200, height: 200 }, viewport), 4);
});

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
  assert.equal(composerHeightForText('hello', 18), 42);
  assert.equal(composerHeightForText('hello\n', 36), 60);
  assert.equal(composerHeightForText('hello\n\n', 54), 78);
  assert.equal(composerHeightForText('wrapped text', 90), 114, 'padding and borders are added to the unconstrained text layout');
  assert.equal(composerHeightForText('\n'.repeat(30), 558), COMPOSER_MAX_HEIGHT);
  assert.equal(composerHeightForText('long wrapped text', 500), COMPOSER_MAX_HEIGHT);
  assert.equal(composerHeightForText('', COMPOSER_MAX_HEIGHT), COMPOSER_MIN_HEIGHT);
});

test('soft-wrapped layout grows and shrinks without requiring Enter', () => {
  const text = 'A long draft with no explicit line breaks';
  assert.equal(text.includes('\n'), false);
  for (const lines of [1, 2, 4, 8, 12, 8, 3, 1]) {
    assert.equal(composerHeightForText(text, lines * COMPOSER_LINE_HEIGHT),
      Math.min(COMPOSER_MAX_HEIGHT, lines * 18 + 24));
  }
  assert.equal(composerHeightForText(text, 36.2), 61, 'fractional layout rounds up to avoid clipping');
  assert.equal(composerHeightForText(text, NaN), COMPOSER_MIN_HEIGHT);
});

test('measurement preserves empty final lines without changing the saved draft', () => {
  for (const text of ['', 'hello', 'hello\n', 'hello\n\n', '👋 @everyone ']) {
    const measured = composerMeasurementText(text);
    assert.equal(measured, `${text}\u200b`);
    assert.equal(measured.slice(0, -1), text);
  }
});

test('composer growth is driven by an in-flow sizer, not a fixed-height callback loop', () => {
  // Guard the screen wiring, not just the height arithmetic: the previous helper
  // tests passed even while the native input stayed fixed at one line.
  const screen = readFileSync(new URL('../app/chat/[id].tsx', import.meta.url), 'utf8');
  const sizerStyle = screen.match(/measure: \{([^\n]+)\}/)?.[1];
  const frameStyle = screen.match(/composerInput: \{([^\n]+)\}/)?.[1];
  const inputStyle = screen.match(/inputText: \{([^\n]+)\}/)?.[1];
  assert.ok(sizerStyle && frameStyle && inputStyle);
  assert.doesNotMatch(sizerStyle, /position:|height:|maxHeight:/);
  assert.match(sizerStyle, /flexShrink: 0/);
  assert.match(frameStyle, /minHeight: COMPOSER_MIN_HEIGHT/);
  assert.match(frameStyle, /maxHeight: COMPOSER_MAX_HEIGHT/);
  assert.match(inputStyle, /StyleSheet\.absoluteFill/);
  assert.match(inputStyle, /height: '100%'/);
  assert.doesNotMatch(screen, /setMeasuredTextHeight|height: visibleInputHeight/);
  const input = screen.match(/<TextInput ref=\{composerInputRef\}[\s\S]*?\/>/)?.[0];
  assert.ok(input);
  assert.match(input, /scrollEnabled=\{composerCanScroll\}/);
  assert.doesNotMatch(input, /\sselection=\{/);
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
