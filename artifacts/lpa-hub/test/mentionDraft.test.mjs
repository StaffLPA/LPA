import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseMentionLastName, reconcileMentions } from '../lib/mentionDraft.ts';

test('first backspace shortens a full-name mention but retains the user ID', () => {
  const fullName = 'Jay Mar Lagmay';
  const original = '@Jay Mar Lagmay ';
  const mention = { userId: 'member-1', displayName: fullName, start: 0, end: original.length - 1 };
  const shortened = collapseMentionLastName(original, original.slice(0, -1), [mention],
    { start: original.length, end: original.length }, () => fullName);
  assert.equal(shortened?.text, '@Jay Mar');
  assert.deepEqual(shortened?.mentions, [{ userId: 'member-1', displayName: 'Jay Mar', start: 0, end: 8 }]);
  assert.deepEqual(reconcileMentions(shortened.text, '@Jay Ma', shortened.mentions), []);
});

test('backspace at mention end preserves following text and shifts later mentions', () => {
  const original = 'Hi @Jane Smith and @Alex Parker';
  const first = { userId: 'jane', displayName: 'Jane Smith', start: 3, end: 14 };
  const second = { userId: 'alex', displayName: 'Alex Parker', start: 19, end: 31 };
  const next = original.slice(0, first.end - 1) + original.slice(first.end);
  const shortened = collapseMentionLastName(original, next, [first, second],
    { start: first.end, end: first.end }, (id) => id === 'jane' ? 'Jane Smith' : 'Alex Parker');
  assert.equal(shortened?.text, 'Hi @Jane and @Alex Parker');
  assert.equal(shortened?.mentions[0].userId, 'jane');
  assert.equal(shortened?.mentions[1].start, 13);
});

test('post-backspace caret events still collapse and keep later words separated', () => {
  const original = '@Jane Smith hello';
  const mention = { userId: 'jane', displayName: 'Jane Smith', start: 0, end: 11 };
  const next = original.slice(0, mention.end) + original.slice(mention.end + 1);
  const shortened = collapseMentionLastName(original, next, [mention],
    { start: mention.end, end: mention.end }, () => 'Jane Smith');
  assert.equal(shortened?.text, '@Jane hello');
  assert.equal(shortened?.cursor, 5);
  assert.deepEqual(reconcileMentions(shortened.text, '@Jan hello', shortened.mentions), []);
});